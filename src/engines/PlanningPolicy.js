/**
 * PlanningPolicy.js — Politique de planification configurable
 *
 * Encapsule toutes les préférences et contraintes d'un plan.
 * Chaque client, agence ou devis peut avoir sa propre politique
 * sans modifier les algorithmes des moteurs.
 *
 * Responsabilité : valeur par défaut + validation + fusion de politiques.
 * Ne contient aucune logique de calcul.
 *
 * Usage :
 *   const policy = PlanningPolicy.from(devisConfig);
 *   PlanningEngine.run(shifts, policy);
 */

import { IDCC_PLANNING_RULES } from '../constants/idcc1351.js';

// ─────────────────────────────────────────────────────────────────────────────
// STRATÉGIES DE ROTATION
// ─────────────────────────────────────────────────────────────────────────────

export const ROTATION_STRATEGIES = Object.freeze({
    LEAST_LOADED      : 'LEAST_LOADED',        // Agent avec le moins d'heures cette semaine
    ROUND_ROBIN       : 'ROUND_ROBIN',          // Distribution cyclique simple
    SAME_AGENT        : 'SAME_AGENT',           // Toujours le même agent si possible
    BALANCED_12WEEKS  : 'BALANCED_12WEEKS',     // Équilibre sur 12 semaines glissantes
    LEAST_FATIGUE     : 'LEAST_FATIGUE',        // Agent le moins fatigué (repos récents)
});

// ─────────────────────────────────────────────────────────────────────────────
// OBJECTIFS D'OPTIMISATION
// ─────────────────────────────────────────────────────────────────────────────

export const OPTIMIZATION_OBJECTIVES = Object.freeze({
    MINIMIZE_COST       : 'MINIMIZE_COST',       // Pool minimum légal
    MAXIMIZE_COMPLIANCE : 'MAXIMIZE_COMPLIANCE', // Tous les scores > 95
    BALANCE_HOURS       : 'BALANCE_HOURS',       // Équilibre des heures (défaut)
    MAXIMIZE_STABILITY  : 'MAXIMIZE_STABILITY',  // Même agent le plus souvent possible
    MINIMIZE_CHANGES    : 'MINIMIZE_CHANGES',    // Continuité agent sur la durée
});

// ─────────────────────────────────────────────────────────────────────────────
// POLITIQUE PAR DÉFAUT — conforme IDCC 1351
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_POLICY = Object.freeze({
    // ── Objectif d'optimisation principal ────────────────────────────────────
    optimizationObjective  : OPTIMIZATION_OBJECTIVES.BALANCE_HOURS,

    // ── Heures hebdomadaires cibles ───────────────────────────────────────────
    // Préfixe "planning" pour éviter toute confusion avec :
    //   contractWeeklyHours  — heures prévues au contrat de travail
    //   legalWeeklyHours     — maximum légal absolu
    //   actualWeeklyHours    — heures réellement effectuées
    //   forecastWeeklyHours  — heures prévisionnelles sur la période
    planningTargetWeeklyHours : 35,    // Cible : contrat standard 35h
    contractWeeklyHours       : null,  // Chargé depuis le contrat agent (si connu)
    legalWeeklyHours          : IDCC_PLANNING_RULES.MAX_WEEKLY_ABSOLUTE, // 48h
 
    // ── Facturation ───────────────────────────────────────────────────────────
    minimumBillableHours : IDCC_PLANNING_RULES.MIN_SHIFT_HOURS_FULLTIME, // 6h IDCC Art. 7

    // ── Stratégie de rotation ─────────────────────────────────────────────────
    rotationStrategy : ROTATION_STRATEGIES.LEAST_LOADED,

    // ── Préférences clients ───────────────────────────────────────────────────
    preferSameAgent        : false,  // Toujours le même agent si possible
    maxConsecutiveNights   : 5,      // Max nuits consécutives par agent
    nightDistribution      : 'BALANCED', // BALANCED | AVOID | CONCENTRATED

    // ── Poids du score multicritère ───────────────────────────────────────────
    // Somme = 1.0. Reconfigurables selon l'objectif principal.
    scoringWeights : Object.freeze({
        legal        : 0.30,  // Conformité IDCC/CCN
        fairness     : 0.20,  // Équité entre agents
        fatigue      : 0.20,  // Charge sur 12 semaines glissantes
        cost         : 0.15,  // Efficience économique
        availability : 0.10,  // Couverture sans trou
        robustness   : 0.05,  // Résistance aux absences
    }),

    // ── Contraintes RH additionnelles (soft — préférences) ───────────────────
    constraints : [],
});

// ─────────────────────────────────────────────────────────────────────────────
// POIDS PAR OBJECTIF D'OPTIMISATION
// ─────────────────────────────────────────────────────────────────────────────

const OBJECTIVE_WEIGHTS = Object.freeze({
    [OPTIMIZATION_OBJECTIVES.MINIMIZE_COST]: {
        legal: 0.25, fairness: 0.10, fatigue: 0.10, cost: 0.40, availability: 0.10, robustness: 0.05,
    },
    [OPTIMIZATION_OBJECTIVES.MAXIMIZE_COMPLIANCE]: {
        legal: 0.50, fairness: 0.20, fatigue: 0.15, cost: 0.05, availability: 0.05, robustness: 0.05,
    },
    [OPTIMIZATION_OBJECTIVES.BALANCE_HOURS]: {
        legal: 0.30, fairness: 0.20, fatigue: 0.20, cost: 0.15, availability: 0.10, robustness: 0.05,
    },
    [OPTIMIZATION_OBJECTIVES.MAXIMIZE_STABILITY]: {
        legal: 0.25, fairness: 0.10, fatigue: 0.15, cost: 0.10, availability: 0.15, robustness: 0.25,
    },
    [OPTIMIZATION_OBJECTIVES.MINIMIZE_CHANGES]: {
        legal: 0.20, fairness: 0.15, fatigue: 0.15, cost: 0.10, availability: 0.15, robustness: 0.25,
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// PlanningPolicy — Classe principale
// ─────────────────────────────────────────────────────────────────────────────

export class PlanningPolicy {
    /**
     * Crée une PlanningPolicy à partir d'une configuration partielle.
     * Les valeurs non fournies héritent des valeurs par défaut IDCC 1351.
     *
     * @param {Partial<typeof DEFAULT_POLICY>} config
     * @returns {PlanningPolicy}
     */
    static from(config = {}) {
        const merged = {
            ...DEFAULT_POLICY,
            ...config,
            scoringWeights: {
                ...DEFAULT_POLICY.scoringWeights,
                ...(config.scoringWeights ?? {}),
            },
        };

        // Si un objectif est défini, surcharger les poids automatiquement
        if (config.optimizationObjective && OBJECTIVE_WEIGHTS[config.optimizationObjective]) {
            merged.scoringWeights = OBJECTIVE_WEIGHTS[config.optimizationObjective];
        }

        return new PlanningPolicy(merged);
    }

    /**
     * Politique par défaut — conforme IDCC 1351, cible 35h.
     * @returns {PlanningPolicy}
     */
    static default() {
        return new PlanningPolicy(DEFAULT_POLICY);
    }

    constructor(data) {
        Object.assign(this, data);
        Object.freeze(this.scoringWeights);
    }

    /**
     * Vérifie que les poids du score sommant à 1.0.
     * @returns {boolean}
     */
    isValid() {
        const sum = Object.values(this.scoringWeights).reduce((a, b) => a + b, 0);
        return Math.abs(sum - 1.0) < 0.001;
    }

    /**
     * Sérialise la politique pour persistance dans execution_plans.constraints (JSONB).
     * @returns {object}
     */
    toJSON() {
        return {
            optimizationObjective      : this.optimizationObjective,
            planningTargetWeeklyHours  : this.planningTargetWeeklyHours,
            minimumBillableHours       : this.minimumBillableHours,
            rotationStrategy           : this.rotationStrategy,
            preferSameAgent            : this.preferSameAgent,
            maxConsecutiveNights       : this.maxConsecutiveNights,
            nightDistribution          : this.nightDistribution,
            scoringWeights             : this.scoringWeights,
            constraints                : this.constraints,
        };
    }
}
