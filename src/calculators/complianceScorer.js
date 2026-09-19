/**
 * Calculateur de score de conformité IDCC 1351 / CCN APS
 *
 * Responsabilité : produire un score de conformité (0–100) et une liste
 * de violations structurées à partir des shifts assignés et du résumé agents.
 *
 * Ce module est pur (pas de dépendances BDD, HTTP ou framework).
 * Il est destiné à être appelé aussi bien côté backend que dans les tests.
 *
 * Références juridiques :
 *   - IDCC 1351 Art. 7        : Vacation minimum 6h (depuis 01/07/2026)
 *   - IDCC 1351 Art. 7.2      : Minimum 2 dimanches de repos / mois
 *   - IDCC 1351               : Moyenne hebdo <= 44h sur 12 semaines glissantes
 *   - L3121-20 Code du travail: Durée hebdomadaire max 48h
 *   - L3131-1 Code du travail : Repos quotidien >= 11h
 *   - L3132-2 Code du travail : Repos hebdomadaire >= 35h continu
 *   - CCN APS Art. 7.05       : Maximum 6 jours consécutifs
 *
 * @module complianceScorer
 */

import { VIOLATIONS } from './rotationEngine.js';

// ============================================================================
// POIDS DES VIOLATIONS
// Définis ici pour être ajustables sans toucher au moteur de rotation.
// Unité : points à déduire du score de base (100).
// ============================================================================

const VIOLATION_WEIGHTS = {
    // Shift impossible à assigner sans violation bloquante
    [VIOLATIONS.NO_AGENT]:                  -25,
    // Shift non assignable (toutes règles épuisées)
    UNASSIGNABLE:                           -25,
    // Moyenne > 44h sur 12 semaines glissantes (IDCC 1351) — par agent
    [VIOLATIONS.ROLLING_AVG_12W_EXCEEDED]:  -20,
    // Dépassement 48h hebdomadaire (L3121-20) — par occurrence
    [VIOLATIONS.MAX_WEEKLY_HOURS]:          -20,
    // Repos hebdomadaire < 35h (L3132-2) — par occurrence
    [VIOLATIONS.MIN_WEEKLY_REST]:           -15,
    // Moins de 2 dimanches de repos par mois (IDCC 1351 art. 7.2) — par mois/agent
    [VIOLATIONS.SUNDAY_REST_INSUFFICIENT]:  -10,
    // Plus de 6 jours consécutifs (CCN APS art. 7.05) — par occurrence
    [VIOLATIONS.MAX_CONSECUTIVE_WORK_DAYS]: -10,
    // Repos quotidien < 11h (L3131-1) — par occurrence
    [VIOLATIONS.MIN_REST]:                  -10,
    // Vacation < 6h (IDCC 1351 Art. 7) — par vacation
    [VIOLATIONS.MIN_VACATION_HOURS]:         -5,
};

// ============================================================================
// SCORE DE CONFORMITÉ
// ============================================================================

/**
 * Calcule un score de conformité IDCC 1351 sur 100.
 *
 * Algorithme :
 *   1. Pénaliser chaque violation de shift (non-assignable, durée, chevauchement...)
 *   2. Pénaliser chaque violation d'agrégat par agent (rolling avg, dimanche repos...)
 *   3. Borner le résultat dans [0, 100] et arrondir à l'entier.
 *
 * Un score de 100 signifie : aucune violation détectée sur l'ensemble du planning.
 * Un score de 0 ou proche signifie : le planning ne respecte pas la CCN.
 *
 * @param {Array} shifts        - Shifts assignés (résultat de assignAgentRotation)
 * @param {Array} agentSummary  - Résumé par agent (résultat de getAgentSummary)
 * @returns {number} Score entier entre 0 et 100
 */
export const buildComplianceScore = (shifts, agentSummary) => {
    if (!shifts?.length) return 100;

    let penalty = 0;

    // --- Violations au niveau shift ---
    for (const shift of shifts) {
        // Shift non assignable (toutes violations bloquantes — cas extrême)
        if (shift.unassignable) {
            penalty += Math.abs(VIOLATION_WEIGHTS.UNASSIGNABLE);
            continue; // Les violations individuelles sont déjà comptées dans unassignable
        }

        // Violations individuelles signalées sur le shift
        for (const violation of (shift.violations || [])) {
            const weight = VIOLATION_WEIGHTS[violation];
            if (weight) penalty += Math.abs(weight);
        }
    }

    // --- Violations au niveau agent (agrégats réglementaires) ---
    for (const agent of (agentSummary || [])) {
        // Moyenne > 44h sur 12 semaines glissantes (IDCC 1351)
        if (agent.rolling12WViolation) {
            penalty += Math.abs(VIOLATION_WEIGHTS[VIOLATIONS.ROLLING_AVG_12W_EXCEEDED]);
        }

        // Dimanches de repos insuffisants (IDCC 1351 art. 7.2) — par mois en violation
        const sundayRestByMonth = agent.sundayRestByMonth || {};
        for (const [, restCount] of Object.entries(sundayRestByMonth)) {
            if (restCount < 2) {
                penalty += Math.abs(VIOLATION_WEIGHTS[VIOLATIONS.SUNDAY_REST_INSUFFICIENT]);
            }
        }

        // Vacations < 6h (IDCC 1351 Art. 7) — déjà comptées au niveau shift,
        // on ne les double-compte pas ici.
    }

    return Math.max(0, Math.min(100, Math.round(100 - penalty)));
};

// ============================================================================
// AVERTISSEMENTS STRUCTURÉS
// ============================================================================

/**
 * Produit une liste structurée d'avertissements de conformité IDCC 1351.
 * Destinée au stockage dans ExecutionPlan.conformanceWarnings (JSONB).
 *
 * Chaque avertissement a la forme :
 *   { code, severity, agentId?, shiftId?, detail }
 *
 * @param {Array} shifts        - Shifts assignés
 * @param {Array} agentSummary  - Résumé par agent
 * @returns {Array} Liste d'avertissements, vide si le planning est conforme
 */
export const buildConformanceWarnings = (shifts, agentSummary) => {
    const warnings = [];

    if (!shifts?.length) return warnings;

    // --- Violations shift ---
    for (const shift of shifts) {
        if (shift.unassignable) {
            warnings.push({
                code:     'UNASSIGNABLE',
                severity: 'critical',
                shiftId:  shift.id,
                detail:   `Vacation ${shift.startAt} → ${shift.endAt} : aucun agent conforme disponible.`,
            });
        }

        for (const violation of (shift.violations || [])) {
            if (violation === VIOLATIONS.MIN_VACATION_HOURS) {
                warnings.push({
                    code:     VIOLATIONS.MIN_VACATION_HOURS,
                    severity: 'warning',
                    agentId:  shift.placeholder?.id,
                    shiftId:  shift.id,
                    detail:   `Vacation de ${shift.duration?.toFixed(1)}h < 6h minimales (IDCC 1351 Art. 7).`,
                });
            }
            if (violation === VIOLATIONS.MIN_REST) {
                warnings.push({
                    code:     VIOLATIONS.MIN_REST,
                    severity: 'strong_warning',
                    agentId:  shift.placeholder?.id,
                    shiftId:  shift.id,
                    detail:   `Repos quotidien < 11h avant la vacation (L3131-1).`,
                });
            }
            if (violation === VIOLATIONS.MAX_CONSECUTIVE_WORK_DAYS) {
                warnings.push({
                    code:     VIOLATIONS.MAX_CONSECUTIVE_WORK_DAYS,
                    severity: 'strong_warning',
                    agentId:  shift.placeholder?.id,
                    shiftId:  shift.id,
                    detail:   `Plus de 6 jours consécutifs détectés (CCN APS Art. 7.05).`,
                });
            }
            if (violation === VIOLATIONS.MAX_WEEKLY_HOURS) {
                warnings.push({
                    code:     VIOLATIONS.MAX_WEEKLY_HOURS,
                    severity: 'critical',
                    agentId:  shift.placeholder?.id,
                    shiftId:  shift.id,
                    detail:   `Dépassement 48h hebdomadaires (L3121-20).`,
                });
            }
            if (violation === VIOLATIONS.MIN_WEEKLY_REST) {
                warnings.push({
                    code:     VIOLATIONS.MIN_WEEKLY_REST,
                    severity: 'critical',
                    agentId:  shift.placeholder?.id,
                    shiftId:  shift.id,
                    detail:   `Repos hebdomadaire < 35h continu (L3132-2).`,
                });
            }
        }
    }

    // --- Violations agrégat agent ---
    for (const agent of (agentSummary || [])) {
        if (agent.rolling12WViolation) {
            warnings.push({
                code:     VIOLATIONS.ROLLING_AVG_12W_EXCEEDED,
                severity: 'critical',
                agentId:  agent.id,
                detail:   `Agent ${agent.id} : moyenne de ${agent.rolling12WAvgMax}h/sem sur 12 semaines > 44h (IDCC 1351).`,
            });
        }

        const sundayRestByMonth = agent.sundayRestByMonth || {};
        for (const [month, restCount] of Object.entries(sundayRestByMonth)) {
            if (restCount < 2) {
                warnings.push({
                    code:     VIOLATIONS.SUNDAY_REST_INSUFFICIENT,
                    severity: 'warning',
                    agentId:  agent.id,
                    detail:   `Agent ${agent.id} — ${month} : ${restCount} dimanche(s) de repos (minimum 2, IDCC 1351 Art. 7.2).`,
                });
            }
        }
    }

    return warnings;
};
