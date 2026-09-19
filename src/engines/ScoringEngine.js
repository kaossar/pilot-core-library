/**
 * ScoringEngine.js — Moteur de score multicritère
 *
 * Calcule un score de qualité sur 6 dimensions pour un scénario de planification.
 * Remplace les scores statiques de SimulationEngine.
 *
 * Dimensions :
 *   legal        — Conformité IDCC/CCN (heures max, repos, amplitudes)
 *   fairness     — Équité de distribution entre agents
 *   fatigue      — Charge sur 12 semaines glissantes
 *   cost         — Efficience économique (pool vs coût)
 *   availability — Couverture sans trou (vacations servies / requises)
 *   robustness   — Résistance aux absences (surplus de pool)
 *
 * Chaque dimension retourne un score [0–100].
 * Le score global est la moyenne pondérée selon PlanningPolicy.scoringWeights.
 *
 * Usage :
 *   const scores = ScoringEngine.evaluate(planningData, policy);
 *   // → { legal: 98, fairness: 91, ..., global: 94 }
 *
 * @module ScoringEngine
 */

import { IDCC_PLANNING_RULES } from '../constants/idcc1351.js';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES STATISTIQUES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule l'écart-type d'un tableau de nombres.
 * @param {number[]} values
 * @returns {number}
 */
function stdDev(values) {
    if (!values.length) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Clamp une valeur entre min et max.
 */
function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Convertit un taux de pénalité [0–1] en score [0–100].
 * penalty=0 → score=100, penalty=1 → score=0.
 */
function penaltyToScore(penalty) {
    return clamp(Math.round((1 - penalty) * 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// DONNÉES D'ENTRÉE — Définition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ScoringInput
 *
 * Données nécessaires au calcul de chaque dimension.
 * Toutes les propriétés sont optionnelles : le moteur se dégrade gracieusement.
 *
 * @property {number}   pool                      Pool effectif d'agents
 * @property {number}   legalMinPool              Pool minimum légal (= 48h/agent/sem)
 * @property {number}   actualHoursPerAgent       Heures réelles/agent/semaine
 * @property {number}   planningTargetWeeklyHours Cible hebdomadaire (35/39/44)
 * @property {number}   [coverageHoursPerDay]     Heures de couverture/jour requises
 * @property {number}   [periodDays]              Durée de la période (jours)
 * @property {number}   [concurrentAgents]        Agents simultanés requis
 *
 * @property {number[]} [agentHoursDistribution]  Heures par agent (pour fairness)
 *   ex: [34, 36, 33, 35, 34] → 5 agents, heures hebdo chacun
 *
 * @property {number}   [average12WeeksHours]     Moyenne sur 12 semaines glissantes
 *   null = donnée non disponible (score fatigue dégradé)
 *
 * @property {number}   [estimatedCost]           Coût total estimé (€)
 * @property {number}   [optimalCost]             Coût du scénario optimal de référence (€)
 *
 * @property {number}   [coveredShifts]           Vacations effectivement couvertes
 * @property {number}   [requiredShifts]          Vacations requises (sans absence)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CALCULATEURS DE DIMENSIONS — Un par critère
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LEGAL — Conformité aux contraintes IDCC/CCN.
 *
 * Pénalités cumulées :
 *   - Dépassement du maximum légal 48h                → -100 pts (bloquant)
 *   - Dépassement du seuil majoration +50% (44h)      → -40 pts
 *   - Dépassement de la cible hebdomadaire            → -20 pts
 *   - Repos hebdomadaire < 35h                        → -30 pts (bloquant)
 */
function scoreLegal({ actualHoursPerAgent, planningTargetWeeklyHours }) {
    if (actualHoursPerAgent == null) return { score: 80, note: 'Heures non disponibles' };

    let penalty = 0;

    // Dépassement du maximum absolu (bloquant)
    if (actualHoursPerAgent > IDCC_PLANNING_RULES.MAX_WEEKLY_ABSOLUTE) {
        penalty += 1.0; // Score 0 — illégal
    } else if (actualHoursPerAgent > IDCC_PLANNING_RULES.OVERTIME_WARNING_THRESHOLD) {
        // Zone 44–48h : majoration +50% obligatoire
        const excess   = actualHoursPerAgent - IDCC_PLANNING_RULES.OVERTIME_WARNING_THRESHOLD;
        penalty += excess / 8 * 0.40; // Proportionnel à l'excès dans la zone 44-48h
    }

    // Dépassement de la cible (pas illégal, mais non optimal)
    if (actualHoursPerAgent > (planningTargetWeeklyHours ?? 35)) {
        const excess = actualHoursPerAgent - (planningTargetWeeklyHours ?? 35);
        penalty += Math.min(excess / 15, 0.20);
    }

    // Repos hebdomadaire insuffisant
    const weeklyRest = 168 - actualHoursPerAgent;
    if (weeklyRest < IDCC_PLANNING_RULES.MIN_WEEKLY_REST_HOURS) {
        const deficit = IDCC_PLANNING_RULES.MIN_WEEKLY_REST_HOURS - weeklyRest;
        penalty += Math.min(deficit / 10, 0.30);
    }

    return {
        score : penaltyToScore(Math.min(1, penalty)),
        detail: {
            actualHoursPerAgent,
            maxLegal   : IDCC_PLANNING_RULES.MAX_WEEKLY_ABSOLUTE,
            weeklyRest,
            penaltyRaw : penalty,
        },
    };
}

/**
 * FAIRNESS — Équité de distribution des heures entre agents.
 *
 * Mesure la dispersion des heures par agent.
 * Score 100 = tous les agents ont exactement les mêmes heures.
 * Score 0   = dispersion maximale (certains agents surexploités).
 *
 * Méthode : coefficient de variation (σ/μ) normalisé.
 * CV = 0 → score 100, CV = 0.20 → score ~60, CV ≥ 0.40 → score 0.
 */
function scoreFairness({ agentHoursDistribution, actualHoursPerAgent, pool }) {
    // Si la distribution détaillée est disponible, on l'utilise
    if (agentHoursDistribution?.length >= 2) {
        const mean = agentHoursDistribution.reduce((a, b) => a + b, 0) / agentHoursDistribution.length;
        const sd   = stdDev(agentHoursDistribution);
        const cv   = mean > 0 ? sd / mean : 0;
        // CV = 0 → 100pts, CV = 0.40 → 0pts (linéaire)
        return {
            score : clamp(Math.round((1 - cv / 0.40) * 100)),
            detail: { mean: +mean.toFixed(1), stdDev: +sd.toFixed(1), cv: +cv.toFixed(3) },
        };
    }

    // Sans distribution détaillée : estimation basée sur pool vs workload théorique
    // Un pool parfait = chaque agent a exactement les mêmes heures
    if (actualHoursPerAgent != null && pool > 0) {
        const targetPerAgent = actualHoursPerAgent; // déjà calculé comme moyenne
        // Sans variance observable, on assume une distribution parfaite (cas théorique)
        return {
            score : 90, // Score conservateur — on ne peut pas prouver l'équité
            detail: { note: 'Estimation (distribution détaillée non disponible)', mean: targetPerAgent },
        };
    }

    return { score: 75, detail: { note: 'Données insuffisantes' } };
}

/**
 * FATIGUE — Charge sur 12 semaines glissantes.
 *
 * Évalue si la charge hebdomadaire est soutenable sur la durée.
 *
 * Référence : IDCC 1351 — moyenne sur 12 semaines ≤ 44h (travailleurs de nuit)
 *              Code du travail — moyenne sur 12 semaines ≤ 46h (standard)
 *
 * Si average12WeeksHours non disponible : score dégradé à 70 (incertitude).
 */
function scoreFatigue({ actualHoursPerAgent, average12WeeksHours, planningTargetWeeklyHours }) {
    const target = planningTargetWeeklyHours ?? 35;

    if (average12WeeksHours != null) {
        // Données 12 semaines disponibles — évaluation précise
        let penalty = 0;

        if (average12WeeksHours > IDCC_PLANNING_RULES.MAX_WEEKLY_NIGHT_WORKERS) {
            // > 44h sur 12 semaines pour travailleurs de nuit — violation
            const excess = average12WeeksHours - IDCC_PLANNING_RULES.MAX_WEEKLY_NIGHT_WORKERS;
            penalty += Math.min(excess / 10, 0.60);
        } else if (average12WeeksHours > IDCC_PLANNING_RULES.MAX_WEEKLY_AVERAGE) {
            // > 46h sur 12 semaines — zone critique
            const excess = average12WeeksHours - IDCC_PLANNING_RULES.MAX_WEEKLY_AVERAGE;
            penalty += Math.min(excess / 8, 0.40);
        } else if (average12WeeksHours > target) {
            // Au-dessus de la cible — pénalité mineure
            const excess = average12WeeksHours - target;
            penalty += Math.min(excess / 20, 0.15);
        }

        return {
            score : penaltyToScore(penalty),
            detail: { average12WeeksHours, target, maxNight: IDCC_PLANNING_RULES.MAX_WEEKLY_NIGHT_WORKERS },
        };
    }

    // Estimation basée sur la semaine actuelle uniquement
    if (actualHoursPerAgent != null) {
        let penalty = 0;
        if (actualHoursPerAgent > IDCC_PLANNING_RULES.MAX_WEEKLY_NIGHT_WORKERS) {
            penalty = 0.50;
        } else if (actualHoursPerAgent > target + 5) {
            penalty = 0.20;
        } else if (actualHoursPerAgent > target) {
            penalty = 0.10;
        }
        return {
            score : Math.min(70, penaltyToScore(penalty)), // Plafonné à 70 sans données 12 sem.
            detail: { note: 'Estimation sur semaine courante (données 12 semaines non disponibles)' },
        };
    }

    return { score: 60, detail: { note: 'Données insuffisantes' } };
}

/**
 * COST — Efficience économique.
 *
 * Évalue le rapport coût/couverture par rapport au scénario de référence.
 *
 * Si coûts non disponibles : score basé sur le ratio pool/legalMin.
 * Plus le pool est proche du minimum légal, meilleur est le score cost.
 */
function scoreCost({ estimatedCost, optimalCost, pool, legalMinPool }) {
    if (estimatedCost != null && optimalCost != null && optimalCost > 0) {
        // Ratio de surcoût vs optimal
        const overCostRatio = (estimatedCost - optimalCost) / optimalCost;
        // 0% surcoût → 100pts, 30% surcoût → 0pts (linéaire)
        return {
            score : clamp(Math.round((1 - overCostRatio / 0.30) * 100)),
            detail: { estimatedCost, optimalCost, overCostRatio: +(overCostRatio * 100).toFixed(1) + '%' },
        };
    }

    // Sans coûts : estimation basée sur le ratio pool/legalMin
    if (pool != null && legalMinPool != null && legalMinPool > 0) {
        const surplus     = pool - legalMinPool;
        // Plus de surplus = moins efficient sur le coût (mais plus robuste)
        const efficiency  = 1 - Math.min(surplus / (legalMinPool * 0.5), 0.40);
        return {
            score : clamp(Math.round(efficiency * 100)),
            detail: { pool, legalMinPool, surplus, note: 'Estimation sans coûts réels' },
        };
    }

    return { score: 75, detail: { note: 'Données coût non disponibles' } };
}

/**
 * AVAILABILITY — Couverture sans trou.
 *
 * Ratio vacations couvertes / vacations requises.
 * Si non disponible : estimation basée sur le pool vs workload.
 */
function scoreAvailability({ coveredShifts, requiredShifts, pool, concurrentAgents }) {
    if (coveredShifts != null && requiredShifts != null && requiredShifts > 0) {
        const coverageRate = coveredShifts / requiredShifts;
        return {
            score : clamp(Math.round(coverageRate * 100)),
            detail: { coveredShifts, requiredShifts, coverageRate: +(coverageRate * 100).toFixed(1) + '%' },
        };
    }

    // Estimation : le pool est-il au moins supérieur aux agents concurrents ?
    if (pool != null && concurrentAgents != null) {
        if (pool >= concurrentAgents) {
            // Théoriquement 100% de couverture possible
            return { score: 95, detail: { note: 'Estimation — pool suffisant' } };
        } else {
            // Pool insuffisant
            const ratio = pool / concurrentAgents;
            return {
                score : clamp(Math.round(ratio * 100)),
                detail: { note: 'Alerte — pool inférieur aux agents requis simultanément' },
            };
        }
    }

    return { score: 80, detail: { note: 'Données de couverture non disponibles' } };
}

/**
 * ROBUSTNESS — Résistance aux absences.
 *
 * Basé sur le surplus de pool par rapport au minimum légal.
 * surplus = 0 → fragile (score 40)
 * surplus = 1 → correct (score 70)
 * surplus = 2 → solide (score 85)
 * surplus ≥ 3 → excellent (score 100)
 */
function scoreRobustness({ pool, legalMinPool }) {
    if (pool == null || legalMinPool == null) {
        return { score: 50, detail: { note: 'Données insuffisantes' } };
    }

    const surplus = Math.max(0, pool - legalMinPool);
    const scores  = [40, 70, 85, 92, 97, 100];
    const score   = scores[Math.min(surplus, scores.length - 1)];

    return {
        score,
        detail: {
            pool,
            legalMinPool,
            surplus,
            absencesAbsorbable: surplus,
            label: surplus === 0 ? 'Fragile' : surplus === 1 ? 'Correct' : surplus >= 2 ? 'Solide' : 'Excellent',
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING ENGINE — Moteur principal
// ─────────────────────────────────────────────────────────────────────────────

export class ScoringEngine {

    /**
     * Évalue un scénario de planification sur 6 dimensions et retourne un score global.
     *
     * @param {ScoringInput}   data   — Données du scénario
     * @param {PlanningPolicy} policy — Politique avec poids du score
     * @returns {PlanningScore}
     */
    static evaluate(data, policy) {
        const weights = policy?.scoringWeights ?? {
            legal: 0.30, fairness: 0.20, fatigue: 0.20, cost: 0.15, availability: 0.10, robustness: 0.05,
        };

        // Calcul de chaque dimension
        const results = {
            legal        : scoreLegal(data),
            fairness     : scoreFairness(data),
            fatigue      : scoreFatigue(data),
            cost         : scoreCost(data),
            availability : scoreAvailability(data),
            robustness   : scoreRobustness(data),
        };

        // Score global pondéré
        const global = Math.round(
            Object.entries(weights).reduce((sum, [key, weight]) => {
                return sum + (results[key]?.score ?? 0) * weight;
            }, 0)
        );

        // Structure de retour complète
        const scores = Object.fromEntries(
            Object.entries(results).map(([key, val]) => [key, val.score])
        );

        const detail = Object.fromEntries(
            Object.entries(results).map(([key, val]) => [key, val.detail])
        );

        return {
            global,
            ...scores,
            detail,
            weights,
        };
    }

    /**
     * Version rapide — évalue uniquement depuis les données de base de PoolOptimizer.
     * Utilisée par SimulationEngine pour enrichir les scénarios.
     *
     * @param {object} poolScenario — Résultat de suggestRotationScenarios()
     * @param {number} legalMinPool
     * @param {PlanningPolicy} policy
     * @returns {PlanningScore}
     */
    static evaluateFromPool(poolScenario, legalMinPool, policy) {
        return this.evaluate({
            pool                    : poolScenario.pool,
            legalMinPool,
            actualHoursPerAgent     : poolScenario.actualHoursPerAgent,
            planningTargetWeeklyHours: poolScenario.planningTargetWeeklyHours,
            estimatedCost           : poolScenario.estimatedCost,
            optimalCost             : null,  // Calculé séparément si besoin
            concurrentAgents        : 1,
            coveredShifts           : null,
            requiredShifts          : null,
            agentHoursDistribution  : null,
            average12WeeksHours     : null,
        }, policy);
    }
}
