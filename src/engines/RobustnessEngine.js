/**
 * RobustnessEngine.js — Moteur de résistance aux risques et absences
 *
 * Analyse la capacité d'un planning à résister aux perturbations opérationnelles
 * (absences imprévues, maladies, indisponibilités CNAPS/congés).
 *
 * Simule des scénarios de défaillance (N agents absents) et évalue :
 *   - Le nombre de vacations orphelines (sans remplaçant qualifié/disponible)
 *   - Les agents de secours activables (respectant le repos 11h et < 48h)
 *   - Les journées/créneaux à haut risque
 *   - Le score global de robustesse (0–100) et son équivalent en étoiles (0–5)
 *
 * @module RobustnessEngine
 */

import { IDCC_PLANNING_RULES } from '../constants/idcc1351.js';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (documentation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AbsenceScenarioResult
 * @property {number}   absentAgentsCount  — Nombre d'agents simultanément absents simulés (1, 2, ...)
 * @property {number}   uncoveredShifts    — Nombre de vacations non couvrables sans heures sup excessives
 * @property {number}   backupAgentsAvailable — Agents du pool en capacité d'absorber la charge
 * @property {string[]} criticalDates      — Dates des créneaux vulnérables (YYYY-MM-DD)
 * @property {boolean}  isFullyCovered     — true si 100% des vacations peuvent être reprises
 * @property {string}   recommendation     — Action corrective suggérée si risque détecté
 */

/**
 * @typedef {Object} RobustnessReport
 * @property {number}   score              — Score global de robustesse [0–100]
 * @property {number}   stars              — Évaluation en étoiles [0–5]
 * @property {string}   label              — Libellé qualitatif ("Critique", "Fragile", "Solide", "Blindé")
 * @property {number}   absorbableAbsences — Nombre max d'absences simultanées absorbables sans rupture
 * @property {AbsenceScenarioResult[]} scenarios — Détail des simulations 1-absent, 2-absents
 * @property {string[]} riskFactors        — Facteurs de vulnérabilité identifiés
 */

// ─────────────────────────────────────────────────────────────────────────────
// ROBUSTNESS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class RobustnessEngine {

    /**
     * Analyse la robustesse d'une configuration ou d'un planning généré.
     *
     * @param {object} input
     * @param {number} input.pool                    — Nombre d'agents dans le pool
     * @param {number} input.legalMinPool            — Pool minimum légal (charge 48h)
     * @param {number} [input.coverageHoursPerDay=24]— Heures de couverture requises par jour
     * @param {number} [input.concurrentAgents=1]   — Nombre d'agents requis en simultané
     * @param {number} [input.periodDays=7]          — Durée de la période en jours
     * @param {Array}  [input.shifts=[]]             — Liste des vacations planifiées (optionnel pour analyse fine)
     * @param {Array}  [input.agents=[]]             — Liste des agents et leurs contraintes (optionnel)
     *
     * @returns {RobustnessReport}
     */
    static evaluate({
        pool,
        legalMinPool,
        coverageHoursPerDay = 24,
        concurrentAgents    = 1,
        periodDays          = 7,
        shifts              = [],
        agents              = [],
    }) {
        const weeklyWorkload = coverageHoursPerDay * 7 * concurrentAgents;
        const totalShiftsCount = shifts.length || Math.ceil((coverageHoursPerDay * periodDays * concurrentAgents) / 12);
        
        // 1. Calcul des scénarios d'absence (1 et 2 agents absents)
        const scenario1 = this._simulateAbsence(1, { pool, legalMinPool, weeklyWorkload, totalShiftsCount, concurrentAgents });
        const scenario2 = this._simulateAbsence(2, { pool, legalMinPool, weeklyWorkload, totalShiftsCount, concurrentAgents });

        const scenarios = [scenario1, scenario2];

        // 2. Évaluation du nombre maximal d'absences absorbables
        const absorbableAbsences = Math.max(0, pool - legalMinPool);

        // 3. Score et étoiles
        const { score, stars, label } = this._computeScoreAndLabel(pool, legalMinPool, scenario1, scenario2);

        // 4. Facteurs de risque identifiés
        const riskFactors = this._identifyRiskFactors({
            pool,
            legalMinPool,
            concurrentAgents,
            absorbableAbsences,
            scenario1,
            scenario2,
        });

        return {
            score,
            stars,
            label,
            absorbableAbsences,
            scenarios,
            riskFactors,
        };
    }

    /**
     * Simule un cas d'absence simultanée de N agents.
     * @private
     */
    static _simulateAbsence(absentCount, { pool, legalMinPool, weeklyWorkload, totalShiftsCount, concurrentAgents }) {
        const remainingPool = Math.max(0, pool - absentCount);
        
        // Risque de rupture si le pool restant est inférieur au nombre d'agents simultanés requis
        if (remainingPool < concurrentAgents) {
            return {
                absentAgentsCount: absentCount,
                uncoveredShifts  : totalShiftsCount,
                backupAgentsAvailable: 0,
                criticalDates    : [],
                isFullyCovered   : false,
                recommendation   : `Rupture de service : au moins ${concurrentAgents} agent(s) simultané(s) requis, seulement ${remainingPool} disponible(s).`,
            };
        }

        // Charge hebdo réaffectée sur le pool restant
        const newHoursPerAgent = remainingPool > 0 ? weeklyWorkload / remainingPool : 999;
        
        // Surcharge si > 48h/agent
        const isOverloaded = newHoursPerAgent > IDCC_PLANNING_RULES.MAX_WEEKLY_ABSOLUTE;
        
        let uncoveredShifts = 0;
        if (isOverloaded) {
            // Estimer le nombre de vacations irréalisables légalement (heures excédant la limite 48h)
            const maxWorkloadPossible = remainingPool * IDCC_PLANNING_RULES.MAX_WEEKLY_ABSOLUTE;
            const missingHours = weeklyWorkload - maxWorkloadPossible;
            uncoveredShifts = Math.ceil(missingHours / 8); // Moyenne 8h par shift
        }

        const isFullyCovered = uncoveredShifts === 0 && !isOverloaded;
        const backupAgentsAvailable = Math.max(0, remainingPool - Math.ceil(weeklyWorkload / 44));

        let recommendation = null;
        if (!isFullyCovered) {
            recommendation = `En cas de départ/absence de ${absentCount} agent(s), la charge atteint ${newHoursPerAgent.toFixed(1)}h/agent. Augmenter le pool à ${pool + 1} agents pour lisser le risque.`;
        } else {
            recommendation = `Absence de ${absentCount} agent(s) entièrement absorbable par le reste de l'équipe (${newHoursPerAgent.toFixed(1)}h/agent).`;
        }

        return {
            absentAgentsCount: absentCount,
            uncoveredShifts,
            backupAgentsAvailable,
            criticalDates: [],
            isFullyCovered,
            recommendation,
        };
    }

    /**
     * Calcule le score global et les étoiles.
     * @private
     */
    static _computeScoreAndLabel(pool, legalMinPool, scenario1, scenario2) {
        const surplus = pool - legalMinPool;
        
        let score = 40; // Base fragile si pool == legalMinPool
        if (surplus === 1) score = 70;
        if (surplus === 2) score = 85;
        if (surplus >= 3) score = 98;

        // Pénalité si le scénario 1 absent n'est pas 100% couvert
        if (!scenario1.isFullyCovered) {
            score = Math.min(score, 30);
        } else if (!scenario2.isFullyCovered) {
            score = Math.min(score, 75);
        }

        let stars = 1;
        let label = 'Critique';

        if (score >= 95) {
            stars = 5;
            label = 'Blindé';
        } else if (score >= 80) {
            stars = 4;
            label = 'Solide';
        } else if (score >= 65) {
            stars = 3;
            label = 'Correct';
        } else if (score >= 45) {
            stars = 2;
            label = 'Fragile';
        }

        return { score, stars, label };
    }

    /**
     * Identifie les facteurs de risque textuels.
     * @private
     */
    static _identifyRiskFactors({ pool, legalMinPool, concurrentAgents, absorbableAbsences, scenario1, scenario2 }) {
        const risks = [];

        if (absorbableAbsences === 0) {
            risks.push("Planning sans aucune marge de manœuvre : la moindre absence crée un dépassement du temps légal (48h).");
        }
        if (!scenario1.isFullyCovered) {
            risks.push(`1 absence entraîne ${scenario1.uncoveredShifts} vacation(s) non couvrables dans le cadre légal.`);
        }
        if (pool <= concurrentAgents) {
            risks.push("Pool égal au besoin simultané : aucune rotation possible en cas d'imprévu.");
        }
        if (scenario1.isFullyCovered && !scenario2.isFullyCovered) {
            risks.push("Planning résistant à 1 maladie, mais vulnérable en cas de vague d'absences (2+ simultanées).");
        }

        if (risks.length === 0) {
            risks.push("Aucun facteur de risque majeur identifié. Le pool dispose de réserves suffisantes.");
        }

        return risks;
    }
}
