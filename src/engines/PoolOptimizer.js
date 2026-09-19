/**
 * PoolOptimizer.js — Optimisation du pool d'agents
 *
 * Calcule le pool optimal pour respecter la cible horaire hebdomadaire
 * (planningTargetWeeklyHours) d'une PlanningPolicy.
 *
 * Fournit :
 *   - Pool minimal légal (hard constraint)
 *   - Pool recommandé par objectif (soft constraint)
 *   - Indice de confiance basé sur la qualité des données RH disponibles
 *   - Scénarios comparatifs (Économique / Équilibré / Confort)
 *
 * Ce module est une fonction pure : pas de BDD, pas de side-effects.
 */

import { IDCC_PLANNING_RULES } from '../constants/idcc1351.js';

// ─────────────────────────────────────────────────────────────────────────────
// CALCUL DU POOL OPTIMAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule le pool d'agents recommandé pour une couverture donnée.
 *
 * Formule : pool = ⌈(coverageHoursPerDay × 7 × concurrentAgents) / planningTargetWeeklyHours⌉
 *
 * @param {object} params
 * @param {number} params.coverageHoursPerDay      Heures de couverture par jour (ex: 24, 12, 8)
 * @param {number} params.concurrentAgents          Agents simultanés sur le poste (ex: 1, 2)
 * @param {number} params.planningTargetWeeklyHours Cible horaire hebdomadaire (ex: 35, 39, 44)
 * @param {object} [params.hrContext]               Contexte RH pour l'indice de confiance
 * @returns {PoolRecommendation}
 */
export function computeOptimalPool({
    coverageHoursPerDay,
    concurrentAgents         = 1,
    planningTargetWeeklyHours = 35,
    hrContext                = null,
}) {
    const weeklyWorkload        = coverageHoursPerDay * 7 * concurrentAgents;
    const pool                  = Math.ceil(weeklyWorkload / planningTargetWeeklyHours);
    const actualHoursPerAgent   = weeklyWorkload / pool;
    const legalMin              = Math.ceil(weeklyWorkload / IDCC_PLANNING_RULES.MAX_WEEKLY_ABSOLUTE);

    // Niveau d'alerte
    let warningLevel = 'ok';
    if (actualHoursPerAgent > IDCC_PLANNING_RULES.MAX_WEEKLY_ABSOLUTE) {
        warningLevel = 'illegal';
    } else if (actualHoursPerAgent > IDCC_PLANNING_RULES.OVERTIME_WARNING_THRESHOLD) {
        warningLevel = 'critical';  // > 44h
    } else if (actualHoursPerAgent > 39) {
        warningLevel = 'warn';      // 39–44h
    }

    // Indice de confiance (dégradé si données manquantes)
    const confidence = hrContext ? computeConfidence(hrContext) : {
        score   : 100,
        reasons : [],
        warnings: [],
    };

    return {
        pool,
        legalMinPool          : legalMin,
        weeklyWorkload,
        actualHoursPerAgent   : +actualHoursPerAgent.toFixed(1),
        targetHoursPerAgent   : planningTargetWeeklyHours,
        usageRatio            : +(actualHoursPerAgent / planningTargetWeeklyHours).toFixed(2),
        warningLevel,
        confidence,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// INDICE DE CONFIANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule un indice de confiance [0–100] basé sur la complétude des données RH.
 *
 * Exemples de pénalités :
 *   - Contrats non renseignés → -10 par contrat manquant
 *   - Congés en attente de validation → -5
 *   - CNAPS expirant dans < 30j → -3 par agent
 *   - Agents à temps partiel sans modulation connue → -5
 *
 * @param {object} hrContext
 * @param {number} hrContext.totalAgents
 * @param {number} [hrContext.missingContracts]
 * @param {number} [hrContext.pendingLeaves]
 * @param {number} [hrContext.cnapsExpiringSoon]
 * @param {number} [hrContext.partialTimeUnknown]
 * @returns {{ score: number, reasons: string[], warnings: string[] }}
 */
function computeConfidence({
    totalAgents      = 1,
    missingContracts = 0,
    pendingLeaves    = 0,
    cnapsExpiringSoon = 0,
    partialTimeUnknown = 0,
}) {
    let score    = 100;
    const reasons  = [];
    const warnings = [];

    if (missingContracts > 0) {
        score -= Math.min(missingContracts * 10, 30);
        warnings.push(`${missingContracts} contrat(s) non renseigné(s)`);
    }
    if (pendingLeaves > 0) {
        score -= Math.min(pendingLeaves * 5, 20);
        warnings.push(`${pendingLeaves} congé(s) en attente de validation`);
    }
    if (cnapsExpiringSoon > 0) {
        score -= Math.min(cnapsExpiringSoon * 3, 15);
        warnings.push(`${cnapsExpiringSoon} carte(s) CNAPS expire(nt) bientôt`);
    }
    if (partialTimeUnknown > 0) {
        score -= Math.min(partialTimeUnknown * 5, 15);
        warnings.push(`${partialTimeUnknown} agent(s) à temps partiel sans modulation connue`);
    }

    if (score >= 95) reasons.push('Toutes les données RH sont connues');
    if (score >= 80) reasons.push(`${totalAgents} agent(s) analysé(s)`);

    return {
        score   : Math.max(0, score),
        reasons,
        warnings,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCÉNARIOS COMPARATIFS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Génère 3 scénarios comparatifs pour une couverture donnée.
 * Utile pour afficher le tableau Économique / Équilibré / Confort dans l'UI.
 *
 * @param {object} params
 * @param {number} params.coverageHoursPerDay
 * @param {number} params.concurrentAgents
 * @param {number} [params.hourlyRate]          Taux horaire pour estimer les coûts
 * @param {number} [params.periodDays]          Durée de la période pour le coût total
 * @param {object} [params.hrContext]
 * @returns {Scenario[]}
 */
export function suggestRotationScenarios({
    coverageHoursPerDay,
    concurrentAgents    = 1,
    hourlyRate          = null,
    periodDays          = 7,
    hrContext           = null,
}) {
    const SCENARIO_TARGETS = [
        { label: 'Économique',  target: 44, scoreBase: 82 },
        { label: 'Équilibré',   target: 39, scoreBase: 91 },
        { label: 'Confort',     target: 35, scoreBase: 97 },
    ];

    const weeklyWorkload = coverageHoursPerDay * 7 * concurrentAgents;
    const legalMin       = Math.ceil(weeklyWorkload / IDCC_PLANNING_RULES.MAX_WEEKLY_ABSOLUTE);

    return SCENARIO_TARGETS.map(({ label, target, scoreBase }) => {
        const rec     = computeOptimalPool({
            coverageHoursPerDay,
            concurrentAgents,
            planningTargetWeeklyHours : target,
            hrContext,
        });

        // Coût estimé si taux fourni
        let estimatedCost = null;
        if (hourlyRate != null) {
            const totalHours = coverageHoursPerDay * periodDays * concurrentAgents;
            estimatedCost = +(totalHours * hourlyRate).toFixed(2);
        }

        return {
            label,
            planningTargetWeeklyHours : target,
            pool                       : rec.pool,
            actualHoursPerAgent        : rec.actualHoursPerAgent,
            warningLevel               : rec.warningLevel,
            isLegal                    : rec.pool >= legalMin,
            estimatedScore             : rec.warningLevel === 'ok' ? scoreBase : Math.max(0, scoreBase - 15),
            estimatedCost,
            confidence                 : rec.confidence,
        };
    }).filter(s => s.isLegal); // Retirer les scénarios illégaux
}
