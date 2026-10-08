/**
 * BillingEngine.js — Moteur de facturation PILOT
 *
 * Produit une BillingProjection à partir d'un Shift.
 * Sépare strictement :
 *   - le temps opérationnel (realStart / realEnd) → utilisé par le planning
 *   - le temps de facturation (billingStart / billingEnd) → utilisé par la comptabilité
 *
 * Architecture empilable :
 *   BillingEngine
 *     .addRule(MinimumVacationRule)   // IDCC Art. 7 — minimum 6h
 *     .addRule(NightSurchargeRule)    // IDCC — +10% nuit (21h-06h)
 *     .addRule(SundayRule)            // IDCC — +10% dimanche
 *     .addRule(PublicHolidayRule)     // IDCC — +100% jours fériés
 *     .addRule(BasketAllowanceRule)   // Panier 4.48€/vacation
 *     .calculate(shift, policy)
 *
 * Chaque règle est indépendante.
 * Ajouter une règle = déclarer une classe, pas modifier le moteur.
 *
 * @module BillingEngine
 */

import { IDCC_PLANNING_RULES, IDCC_MAJORATIONS } from '../constants/idcc1351.js';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES HORAIRES INTERNES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convertit "HH:mm" ou Date en minutes depuis minuit.
 * @param {string|Date} t
 * @returns {number}
 */
function toMinutes(t) {
    if (t instanceof Date) return t.getHours() * 60 + t.getMinutes();
    if (typeof t === 'number') return t;
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + (m || 0);
}

/**
 * Convertit des minutes depuis minuit en "HH:mm".
 * @param {number} minutes
 * @returns {string}
 */
function toHHmm(minutes) {
    const total = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Durée en heures entre deux temps "HH:mm" (gère le passage minuit).
 */
function durationHours(startHHmm, endHHmm) {
    const s = toMinutes(startHHmm);
    const e = toMinutes(endHHmm);
    const diff = e >= s ? e - s : e + 1440 - s;
    return diff / 60;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (documentation uniquement — JavaScript)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Shift
 * @property {string}  realStart  — Début réel (HH:mm) — temps opérationnel
 * @property {string}  realEnd    — Fin réelle (HH:mm) — temps opérationnel
 * @property {string}  [date]     — Date de la vacation (YYYY-MM-DD)
 * @property {boolean} [isSunday]
 * @property {boolean} [isHoliday]
 */

/**
 * @typedef {Object} BillingBucket
 * @property {string}  label    — Type de segment (ex: "Nuit", "Jour", "Dimanche")
 * @property {string}  from     — Début du segment (HH:mm)
 * @property {string}  to       — Fin du segment (HH:mm)
 * @property {number}  hours    — Durée en heures
 * @property {number}  coeff    — Coefficient multiplicateur (ex: 1.10)
 * @property {string}  ruleId   — Règle ayant produit ce bucket
 */

/**
 * @typedef {Object} BillingProjection
 * @property {string}        billingStart    — Début facturé (HH:mm)
 * @property {string}        billingEnd      — Fin facturée (HH:mm)
 * @property {number}        billingHours    — Total heures facturées
 * @property {BillingBucket[]} billingBuckets — Décomposition par segment
 * @property {number}        totalAmount     — Montant brut (€)
 * @property {object[]}      appliedRules    — Règles appliquées avec trace
 * @property {object|null}   billingFloor    — Métadonnées plancher si applicable
 */

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLES DE FACTURATION — INTERFACES ET IMPLÉMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface de base pour toutes les règles de facturation.
 * Chaque règle reçoit le contexte de facturation courant et peut le modifier.
 */
class BillingRule {
    /** Identifiant unique de la règle — utilisé dans les traces d'audit. */
    get id() { return 'BASE_RULE'; }

    /**
     * Applique la règle au contexte de facturation.
     * @param {Object} ctx — Contexte mutable : { billingStart, billingEnd, buckets, shift, policy }
     * @returns {Object} ctx modifié
     */
    apply(ctx) { return ctx; }
}

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLE 1 — Minimum facturable IDCC 1351 Art. 7
// ─────────────────────────────────────────────────────────────────────────────

export class MinimumVacationRule extends BillingRule {
    get id() { return 'IDCC-1351-ART7-MIN-6H'; }

    /**
     * Si la durée réelle < minimumBillableHours :
     *   - billingStart est reculé (fin fixe = ancrage client)
     *   - Les buckets sont recalculés sur la nouvelle plage
     *   - realStart et realEnd ne sont JAMAIS modifiés
     */
    apply(ctx) {
        const { billingStart, billingEnd, shift, policy } = ctx;
        const minHours = policy?.minimumBillableHours ?? IDCC_PLANNING_RULES.MIN_SHIFT_HOURS_FULLTIME;
        const realDuration = durationHours(billingStart, billingEnd);

        if (realDuration >= minHours) return ctx; // Rien à faire

        const deficit = minHours - realDuration;
        const startMin = toMinutes(billingStart);
        const adjustedStartMin = startMin - deficit * 60;
        const adjustedStart = toHHmm(adjustedStartMin);

        return {
            ...ctx,
            billingStart : adjustedStart,
            // Les buckets seront reconstruits par les règles de majoration suivantes
            // sur la nouvelle plage adjustedStart → billingEnd
            billingFloor : {
                applied          : true,
                delta            : deficit,                          // Heures ajoutées
                originalStart    : shift.realStart,                  // Début réel (inchangé)
                adjustedStart,                                        // Nouveau début facturation
                rule             : this.id,
                legalRef         : 'IDCC 1351 Art. 7',
            },
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLE 2 — Décomposition et majorations (nuit, dimanche, férié)
// ─────────────────────────────────────────────────────────────────────────────

export class SurchargeDecompositionRule extends BillingRule {
    get id() { return 'IDCC-1351-SURCHARGES'; }

    /**
     * Décompose la plage billingStart → billingEnd en buckets avec leurs coefficients.
     * Gère les passages minuit, les jours fériés et les dimanches.
     */
    apply(ctx) {
        const { billingStart, billingEnd, shift } = ctx;
        const isSunday  = shift.isSunday  ?? false;
        const isHoliday = shift.isHoliday ?? false;

        const buckets = this._decompose(billingStart, billingEnd, isSunday, isHoliday);

        return { ...ctx, buckets };
    }

    _decompose(startHHmm, endHHmm, isSunday, isHoliday) {
        const NIGHT_START = IDCC_PLANNING_RULES.NIGHT_START_HOUR * 60; // 21*60 = 1260
        const NIGHT_END   = IDCC_PLANNING_RULES.NIGHT_END_HOUR   * 60; // 06*60 = 360

        const startMin  = toMinutes(startHHmm);
        const endMin    = toMinutes(endHHmm);
        // Passage minuit : on travaille en minutes "déroulées" sur 1440 max
        const duration  = endMin >= startMin ? endMin - startMin : endMin + 1440 - startMin;

        const buckets = [];
        let cursor = startMin;
        let remaining = duration;

        while (remaining > 0) {
            const cursorMod = cursor % 1440;
            const isNight = this._isNightMinute(cursorMod, NIGHT_START, NIGHT_END);

            // Calculer combien de minutes dans ce segment (jour ou nuit)
            const segmentEnd = this._nextTransition(cursorMod, NIGHT_START, NIGHT_END);
            const segmentDuration = Math.min(remaining, segmentEnd);

            if (segmentDuration <= 0) break;

            const hours = segmentDuration / 60;
            const coeff = this._coeff(isNight, isSunday, isHoliday);
            const label = this._label(isNight, isSunday, isHoliday);

            buckets.push({
                label,
                from   : toHHmm(cursor),
                to     : toHHmm(cursor + segmentDuration),
                hours  : +hours.toFixed(4),
                coeff,
                ruleId : this.id,
            });

            cursor    += segmentDuration;
            remaining -= segmentDuration;
        }

        return buckets;
    }

    _isNightMinute(minuteMod, nightStart, nightEnd) {
        // Nuit = 21h00–06h00 (passe minuit)
        return minuteMod >= nightStart || minuteMod < nightEnd;
    }

    _nextTransition(minuteMod, nightStart, nightEnd) {
        const isNight = this._isNightMinute(minuteMod, nightStart, nightEnd);
        if (isNight) {
            // Prochain changement = passage vers le jour (nightEnd ou nightStart selon position)
            const toDay = minuteMod >= nightStart
                ? (1440 - minuteMod) + nightEnd   // → lendemain 06h
                : nightEnd - minuteMod;            // → aujourd'hui 06h
            return toDay;
        } else {
            // Prochain changement = passage vers la nuit (21h)
            return nightStart - minuteMod;
        }
    }

    _coeff(isNight, isSunday, isHoliday) {
        if (isHoliday && isSunday && isNight) return IDCC_MAJORATIONS.FERIE * 1.10 * 1.10; // Max conventionnel
        if (isHoliday && isSunday)            return IDCC_MAJORATIONS.FERIE * 1.10;
        if (isHoliday && isNight)             return IDCC_MAJORATIONS.FERIE * 1.10;
        if (isHoliday)                        return IDCC_MAJORATIONS.FERIE;
        if (isSunday && isNight)              return IDCC_MAJORATIONS.DIMANCHE * IDCC_MAJORATIONS.NUIT;
        if (isSunday)                         return IDCC_MAJORATIONS.DIMANCHE;
        if (isNight)                          return IDCC_MAJORATIONS.NUIT;
        return 1.00;
    }

    _label(isNight, isSunday, isHoliday) {
        if (isHoliday) return isNight ? 'Jour férié (nuit)' : 'Jour férié';
        if (isSunday)  return isNight ? 'Dimanche (nuit)'   : 'Dimanche';
        return isNight ? 'Nuit' : 'Jour';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLE 3 — Prime de panier
// ─────────────────────────────────────────────────────────────────────────────

export class BasketAllowanceRule extends BillingRule {
    get id() { return 'IDCC-1351-PANIER'; }

    /**
     * Ajoute la prime de panier IDCC 1351 (4.48 €/vacation).
     * Appliquée sur toute vacation quelle que soit sa durée facturée.
     */
    apply(ctx) {
        const basket = ctx.policy?.basketAmount ?? 4.48; // IDCC 1351 valeur 2026
        return {
            ...ctx,
            allowances : [
                ...(ctx.allowances ?? []),
                { label: 'Prime de panier', amount: basket, ruleId: this.id },
            ],
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING ENGINE — Moteur principal
// ─────────────────────────────────────────────────────────────────────────────

export class BillingEngine {
    constructor() {
        this._rules = [];
    }

    /**
     * Ajoute une règle de facturation au pipeline.
     * Les règles sont appliquées dans l'ordre d'ajout.
     *
     * @param {BillingRule} rule
     * @returns {BillingEngine} pour chaînage
     */
    addRule(rule) {
        this._rules.push(rule);
        return this;
    }

    /**
     * Calcule la projection de facturation d'un shift.
     *
     * @param {Shift}         shift   — Shift opérationnel (realStart/realEnd)
     * @param {PlanningPolicy} policy — Politique active
     * @param {number}         hourlyRate — Taux horaire brut (€)
     * @returns {BillingProjection}
     */
    calculate(shift, policy, hourlyRate) {
        // Contexte initial — billingStart = realStart (avant toute règle)
        let ctx = {
            billingStart  : shift.realStart,
            billingEnd    : shift.realEnd,
            buckets       : [],
            allowances    : [],
            billingFloor  : null,
            appliedRules  : [],
            shift,
            policy,
        };

        // Appliquer chaque règle en séquence
        for (const rule of this._rules) {
            const before = ctx.billingStart;
            ctx = rule.apply(ctx);
            ctx.appliedRules = [
                ...ctx.appliedRules,
                { ruleId: rule.id, startBefore: before, startAfter: ctx.billingStart },
            ];
        }

        // Calculer le montant total à partir des buckets
        const billingHours  = ctx.buckets.reduce((s, b) => s + b.hours, 0);
        const bucketsAmount = hourlyRate
            ? ctx.buckets.reduce((s, b) => s + b.hours * b.coeff * hourlyRate, 0)
            : null;
        const allowancesTotal = ctx.allowances.reduce((s, a) => s + a.amount, 0);

        return {
            // Temps opérationnel — JAMAIS modifié
            realStart     : shift.realStart,
            realEnd       : shift.realEnd,
            realDuration  : durationHours(shift.realStart, shift.realEnd),

            // Temps de facturation — produit par les règles
            billingStart  : ctx.billingStart,
            billingEnd    : ctx.billingEnd,
            billingHours  : +billingHours.toFixed(4),
            billingBuckets: ctx.buckets,
            allowances    : ctx.allowances,

            // Montant (si taux horaire fourni)
            totalAmount   : bucketsAmount != null ? +(bucketsAmount + allowancesTotal).toFixed(2) : null,
            bucketsAmount : bucketsAmount != null ? +bucketsAmount.toFixed(2) : null,
            allowancesTotal: +allowancesTotal.toFixed(2),

            // Traçabilité
            billingFloor  : ctx.billingFloor,
            appliedRules  : ctx.appliedRules,
        };
    }

    /**
     * Fabrique préconfigurée — PILOT standard IDCC 1351.
     * Règles dans l'ordre légal : plancher → décomposition → panier.
     *
     * @returns {BillingEngine}
     */
    static idcc1351() {
        return new BillingEngine()
            .addRule(new MinimumVacationRule())
            .addRule(new SurchargeDecompositionRule())
            .addRule(new BasketAllowanceRule());
    }
}
