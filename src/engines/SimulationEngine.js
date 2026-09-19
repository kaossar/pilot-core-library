/**
 * SimulationEngine.js — Moteur de simulation comparative
 *
 * Génère N scénarios de planification à partir d'une configuration de couverture,
 * les compare sur les dimensions coût / score / robustesse, et désigne le scénario
 * recommandé selon la PlanningPolicy active.
 *
 * Pipeline :
 *   SimulationEngine.run(config, policy)
 *       ↓
 *   PoolOptimizer.suggestRotationScenarios()   → 3 scénarios bruts
 *       ↓
 *   ScoringEngine.evaluate()                   → scores par scénario (simplifié Sprint 2)
 *       ↓
 *   DecisionEngine.explain()                   → explication du scénario retenu
 *       ↓
 *   SimulationResult { scenarios, recommended, decision }
 *
 * Usage :
 *   const result = SimulationEngine.run({
 *       coverageHoursPerDay : 24,
 *       concurrentAgents    : 1,
 *       hourlyRate          : 25.00,
 *       periodDays          : 18,
 *   }, PlanningPolicy.default());
 *
 * @module SimulationEngine
 */

import { computeOptimalPool, suggestRotationScenarios } from './PoolOptimizer.js';
import { DecisionEngine } from './DecisionEngine.js';
import { OPTIMIZATION_OBJECTIVES } from './PlanningPolicy.js';
import { ScoringEngine } from './ScoringEngine.js';

// BASE_SCORES statiques supprimés — remplacés par ScoringEngine (Sprint 3)

// ─────────────────────────────────────────────────────────────────────────────
// ROBUSTESSE SIMPLIFIÉE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule un indice de robustesse simplifié (0–100) basé sur le surplus de pool.
 * Plus le pool est grand par rapport au minimum légal, plus il est robuste.
 *
 * @param {number} pool          Pool effectif
 * @param {number} legalMinPool  Pool minimum légal
 * @param {number} totalShifts   Nombre total de vacations sur la période
 */
function computeRobustness(pool, legalMinPool, totalShifts) {
    const surplus     = pool - legalMinPool;
    const stars       = Math.min(5, surplus + 1);
    const scoreRaw    = Math.min(100, 60 + surplus * 15);
    const absenceSafe = surplus; // Nombre d'absences simultanées absorbables

    return {
        score      : scoreRaw,
        stars,
        label      : stars >= 4 ? 'Solide' : stars >= 3 ? 'Correct' : stars >= 2 ? 'Fragile' : 'Critique',
        absenceSafe,
        description: absenceSafe > 0
            ? `${absenceSafe} absence(s) simultanée(s) absorbable(s) sans impact planning`
            : 'Toute absence dégrade la couverture — aucun agent de secours',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class SimulationEngine {

    /**
     * Génère les scénarios comparatifs et recommande le meilleur selon la policy.
     *
     * @param {object}        config
     * @param {number}        config.coverageHoursPerDay   Heures de couverture/jour
     * @param {number}        [config.concurrentAgents=1]  Agents simultanés
     * @param {number}        [config.hourlyRate]          Taux horaire client (€)
     * @param {number}        [config.periodDays=7]        Durée de la période
     * @param {object}        [config.hrContext]           Contexte RH (pour confiance)
     *
     * @param {PlanningPolicy} policy
     *
     * @returns {SimulationResult}
     */
    static run(config, policy) {
        const {
            coverageHoursPerDay,
            concurrentAgents = 1,
            hourlyRate       = null,
            periodDays       = 7,
            hrContext        = null,
        } = config;

        // 1. Génération des scénarios bruts via PoolOptimizer
        const rawScenarios = suggestRotationScenarios({
            coverageHoursPerDay,
            concurrentAgents,
            hourlyRate,
            periodDays,
            hrContext,
        });

        // 2. Calcul du pool minimum légal (référence pour la robustesse)
        const legalRef = computeOptimalPool({
            coverageHoursPerDay,
            concurrentAgents,
            planningTargetWeeklyHours: 48, // max légal absolu
        });
        const legalMinPool   = legalRef.pool;
        const totalShifts    = Math.ceil((coverageHoursPerDay * periodDays) / 12); // estimation

        // 3. Enrichissement de chaque scénario — scores via ScoringEngine multicritère
        const scenarios = rawScenarios.map(raw => {
            // Score multicritère dynamique (ScoringEngine Sprint 3)
            const planningScore = ScoringEngine.evaluateFromPool(raw, legalMinPool, policy);
            const robustness    = computeRobustness(raw.pool, legalMinPool, totalShifts);

            return {
                ...raw,
                scores        : planningScore,
                estimatedScore: planningScore.global,
                robustness,
                isRecommended : false, // déterminé ci-dessous
            };
        });

        // 4. Sélection du scénario recommandé selon l'objectif
        const recommended = this._selectBest(scenarios, policy);

        // Marquer le scénario recommandé
        const scoredScenarios = scenarios.map(s => ({
            ...s,
            isRecommended: s.label === recommended.label,
        }));

        // 5. Explication via DecisionEngine
        const alternatives = scoredScenarios.filter(s => !s.isRecommended);
        const decision      = DecisionEngine.explain(recommended, alternatives, {
            planningTargetWeeklyHours: policy.planningTargetWeeklyHours,
        });

        return {
            scenarios    : scoredScenarios,
            recommended,
            decision,
            policy       : policy.toJSON(),
            meta         : {
                legalMinPool,
                coverageHoursPerDay,
                concurrentAgents,
                periodDays,
                weeklyWorkload: coverageHoursPerDay * 7 * concurrentAgents,
            },
        };
    }

    /**
     * Sélectionne le meilleur scénario selon l'objectif d'optimisation de la policy.
     *
     * @private
     */
    static _selectBest(scenarios, policy) {
        if (!scenarios.length) throw new Error('[SimulationEngine] Aucun scénario valide');

        switch (policy.optimizationObjective) {
            case OPTIMIZATION_OBJECTIVES.MINIMIZE_COST:
                // Le moins cher = pool minimum légal
                return scenarios.reduce((best, s) => s.pool < best.pool ? s : best);

            case OPTIMIZATION_OBJECTIVES.MAXIMIZE_COMPLIANCE:
                // Score global maximum
                return scenarios.reduce((best, s) =>
                    s.estimatedScore > best.estimatedScore ? s : best
                );

            case OPTIMIZATION_OBJECTIVES.MAXIMIZE_STABILITY:
                // Meilleure robustesse
                return scenarios.reduce((best, s) =>
                    s.robustness.score > best.robustness.score ? s : best
                );

            case OPTIMIZATION_OBJECTIVES.BALANCE_HOURS:
            default: {
                // Meilleur équilibre : score pondéré global
                return scenarios.reduce((best, s) =>
                    s.estimatedScore > best.estimatedScore ? s : best
                );
            }
        }
    }
}
