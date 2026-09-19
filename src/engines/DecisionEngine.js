/**
 * DecisionEngine.js — Moteur de décision expliquée
 *
 * Produit une explication structurée pour chaque recommandation du Planning Engine.
 * Ne fait aucun calcul supplémentaire : il explique les calculs existants.
 *
 * Principe :
 *   PlanningEngine → résultat brut (pool, score, heures)
 *       ↓
 *   DecisionEngine → { reasons, alternatives, confidence, narrative }
 *       ↓
 *   UI → "Pool conseillé : 5 agents — Pourquoi ?"
 *
 * Ce moteur est intentionnellement stateless et pur.
 * Entrée = données calculées. Sortie = explication.
 *
 * @module DecisionEngine
 */

import { IDCC_PLANNING_RULES } from '../constants/idcc1351.js';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (documentation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DecisionReason
 * @property {string}  ruleId      — Identifiant de la règle (ex: "IDCC-MAX-WEEKLY")
 * @property {string}  label       — Libellé affiché (ex: "Cible 35h/semaine respectée")
 * @property {boolean} passed      — La règle est-elle satisfaite ?
 * @property {string}  [value]     — Valeur constatée (ex: "33.6h/agent")
 * @property {string}  [threshold] — Seuil de référence (ex: "≤ 35h")
 * @property {'critical'|'major'|'minor'} impact — Importance si non satisfaite
 * @property {string}  [legalRef]  — Référence légale (ex: "IDCC 1351 Art. 7")
 */

/**
 * @typedef {Object} Decision
 * @property {object}          selected       — Scénario sélectionné
 * @property {DecisionReason[]} reasons        — Raisons de la décision
 * @property {object[]}        alternatives   — Scénarios non sélectionnés
 * @property {number}          confidence     — Score de confiance 0-100
 * @property {string}          narrative      — Texte court lisible par un commercial
 * @property {string[]}        warnings       — Alertes non bloquantes
 * @property {string[]}        blockers       — Violations légales (hard constraints)
 */

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLES D'EXPLICATION — Bibliothèque
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chaque règle d'explication prend le contexte et retourne une DecisionReason.
 * Elles ne calculent rien — elles interprètent des valeurs déjà calculées.
 */

const EXPLANATION_RULES = [
    {
        id    : 'WEEKLY_TARGET',
        label : 'Cible hebdomadaire',
        impact: 'critical',
        legalRef: null,
        evaluate({ actualHoursPerAgent, planningTargetWeeklyHours }) {
            const passed = actualHoursPerAgent <= planningTargetWeeklyHours;
            return {
                ruleId   : this.id,
                label    : passed
                    ? `Cible ${planningTargetWeeklyHours}h/semaine respectée`
                    : `Cible ${planningTargetWeeklyHours}h/semaine dépassée`,
                passed,
                value    : `${actualHoursPerAgent}h/agent`,
                threshold: `≤ ${planningTargetWeeklyHours}h`,
                impact   : this.impact,
                legalRef : this.legalRef,
            };
        },
    },
    {
        id    : 'LEGAL_WEEKLY_MAX',
        label : 'Maximum légal hebdomadaire',
        impact: 'critical',
        legalRef: 'Code du travail Art. L3121-20',
        evaluate({ actualHoursPerAgent }) {
            const max    = IDCC_PLANNING_RULES.MAX_WEEKLY_ABSOLUTE;
            const passed = actualHoursPerAgent <= max;
            return {
                ruleId   : this.id,
                label    : passed
                    ? 'Maximum légal 48h/semaine respecté'
                    : `Maximum légal 48h/semaine dépassé (${actualHoursPerAgent}h)`,
                passed,
                value    : `${actualHoursPerAgent}h/agent`,
                threshold: `≤ ${max}h`,
                impact   : this.impact,
                legalRef : this.legalRef,
            };
        },
    },
    {
        id    : 'OVERTIME_RISK',
        label : 'Risque heures supplémentaires',
        impact: 'major',
        legalRef: 'IDCC 1351',
        evaluate({ actualHoursPerAgent }) {
            const threshold = IDCC_PLANNING_RULES.OVERTIME_WARNING_THRESHOLD; // 44h
            const passed    = actualHoursPerAgent <= threshold;
            return {
                ruleId   : this.id,
                label    : passed
                    ? 'Pas de risque d\'heures supplémentaires majorées'
                    : `Risque de majoration +50% (${actualHoursPerAgent}h > 44h)`,
                passed,
                value    : `${actualHoursPerAgent}h/agent`,
                threshold: `≤ ${threshold}h`,
                impact   : this.impact,
                legalRef : this.legalRef,
            };
        },
    },
    {
        id    : 'REST_GUARANTEE',
        label : 'Repos hebdomadaire garanti',
        impact: 'major',
        legalRef: 'IDCC 1351 — 35h de repos/semaine',
        evaluate({ actualHoursPerAgent }) {
            // 168h/sem - heures travaillées = repos disponible
            const restHours = 168 - actualHoursPerAgent;
            const passed    = restHours >= IDCC_PLANNING_RULES.MIN_WEEKLY_REST_HOURS;
            return {
                ruleId   : this.id,
                label    : passed
                    ? `Repos hebdomadaire garanti (${restHours.toFixed(1)}h disponibles)`
                    : `Repos hebdomadaire insuffisant (${restHours.toFixed(1)}h < 35h)`,
                passed,
                value    : `${restHours.toFixed(1)}h de repos`,
                threshold: `≥ ${IDCC_PLANNING_RULES.MIN_WEEKLY_REST_HOURS}h`,
                impact   : this.impact,
                legalRef : this.legalRef,
            };
        },
    },
    {
        id    : 'COST_VS_NEXT',
        label : 'Efficience économique',
        impact: 'minor',
        legalRef: null,
        evaluate({ pool, alternativePool, estimatedCost, alternativeCost }) {
            if (!alternativePool || !estimatedCost || !alternativeCost) {
                return { ruleId: this.id, label: 'Coût non estimé', passed: true, impact: 'minor' };
            }
            const saving  = alternativeCost - estimatedCost;
            const savingP = ((saving / alternativeCost) * 100).toFixed(0);
            const passed  = pool <= alternativePool;
            return {
                ruleId   : this.id,
                label    : passed
                    ? `${savingP}% moins coûteux que ${alternativePool} agents`
                    : `Plus coûteux que ${alternativePool} agents`,
                passed,
                value    : estimatedCost ? `${estimatedCost.toLocaleString('fr-FR')} €` : null,
                impact   : this.impact,
            };
        },
    },
    {
        id    : 'SCORE_COMPLIANCE',
        label : 'Score de conformité',
        impact: 'major',
        legalRef: null,
        evaluate({ score }) {
            if (score == null) return { ruleId: this.id, label: 'Score non disponible', passed: true, impact: 'minor' };
            const passed = score >= 90;
            return {
                ruleId   : this.id,
                label    : `Score de conformité : ${score}/100`,
                passed,
                value    : `${score}/100`,
                threshold: '≥ 90/100',
                impact   : this.impact,
            };
        },
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// DECISION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class DecisionEngine {

    /**
     * Produit une décision expliquée à partir d'un scénario sélectionné
     * et de ses alternatives.
     *
     * @param {object}   selected    — Scénario retenu (depuis SimulationEngine)
     * @param {object[]} alternatives — Autres scénarios non retenus
     * @param {object}   [meta]      — Métadonnées additionnelles (hrContext, etc.)
     * @returns {Decision}
     */
    static explain(selected, alternatives = [], meta = {}) {
        const ctx = {
            pool                    : selected.pool,
            actualHoursPerAgent     : selected.actualHoursPerAgent,
            planningTargetWeeklyHours: selected.planningTargetWeeklyHours,
            score                   : selected.estimatedScore,
            estimatedCost           : selected.estimatedCost,
            // Alternative la plus proche (pool immédiatement supérieur)
            alternativePool         : alternatives[0]?.pool ?? null,
            alternativeCost         : alternatives[0]?.estimatedCost ?? null,
            ...meta,
        };

        // Évaluer chaque règle
        const reasons  = EXPLANATION_RULES.map(rule => rule.evaluate(ctx));
        const blockers = reasons.filter(r => !r.passed && r.impact === 'critical').map(r => r.label);
        const warnings = reasons.filter(r => !r.passed && r.impact === 'major').map(r => r.label);

        // Score de confiance global de la décision
        const passedCount    = reasons.filter(r => r.passed).length;
        const confidence     = Math.round((passedCount / reasons.length) * 100);

        return {
            selected,
            reasons,
            alternatives,
            confidence,
            blockers,
            warnings,
            narrative : this._buildNarrative(selected, reasons, ctx),
        };
    }

    /**
     * Génère un texte court lisible par un commercial.
     * Maximum 2 phrases.
     *
     * @private
     */
    static _buildNarrative(selected, reasons, ctx) {
        const passedLabels = reasons
            .filter(r => r.passed)
            .map(r => r.label)
            .slice(0, 3); // Max 3 raisons dans le texte

        const pool  = selected.pool;
        const hours = selected.actualHoursPerAgent;

        let text = `Pool conseillé : ${pool} agent${pool > 1 ? 's' : ''} (${hours}h/sem en moyenne).`;

        if (passedLabels.length > 0) {
            text += ` ${passedLabels[0]}.`;
        }

        if (selected.estimatedCost && ctx.alternativeCost) {
            const savingP = (((ctx.alternativeCost - selected.estimatedCost) / ctx.alternativeCost) * 100).toFixed(0);
            if (savingP > 0) text += ` Économie de ${savingP}% vs option supérieure.`;
        }

        return text;
    }

    /**
     * Version simplifiée : explique uniquement un résultat de PoolOptimizer
     * sans alternatives (usage direct depuis le calculateur).
     *
     * @param {object} poolResult — Résultat de computeOptimalPool()
     * @param {object} [meta]
     * @returns {Decision}
     */
    static explainPool(poolResult, meta = {}) {
        const syntheticScenario = {
            pool                     : poolResult.pool,
            actualHoursPerAgent      : poolResult.actualHoursPerAgent,
            planningTargetWeeklyHours: poolResult.targetHoursPerAgent,
            estimatedScore           : poolResult.warningLevel === 'ok' ? 97 : 75,
            estimatedCost            : null,
        };
        return this.explain(syntheticScenario, [], {
            planningTargetWeeklyHours: poolResult.targetHoursPerAgent,
            ...meta,
        });
    }
}
