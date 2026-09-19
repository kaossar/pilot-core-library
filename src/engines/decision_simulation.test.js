/**
 * Tests Sprint 2 — DecisionEngine + SimulationEngine
 *
 * Coverage :
 *   DE1  — DecisionEngine.explainPool : pool légal → raisons positives
 *   DE2  — DecisionEngine.explainPool : pool illégal → blockers
 *   DE3  — DecisionEngine.explain : narrative générée
 *   DE4  — DecisionEngine.explain : alternatives transmises
 *   SE1  — SimulationEngine.run : génère ≥ 2 scénarios légaux
 *   SE2  — SimulationEngine.run : scénario recommandé désigné
 *   SE3  — SimulationEngine.run : decision contient des raisons
 *   SE4  — SimulationEngine.run : objectif MINIMIZE_COST → pool le plus petit
 *   SE5  — SimulationEngine.run : robustesse calculée sur chaque scénario
 *   SE6  — SimulationEngine.run : scores sous-critères présents
 */

import { describe, it, expect } from 'vitest';
import { DecisionEngine } from './DecisionEngine.js';
import { SimulationEngine } from './SimulationEngine.js';
import { PlanningPolicy, OPTIMIZATION_OBJECTIVES } from './PlanningPolicy.js';

// ─────────────────────────────────────────────────────────────────────────────
// DecisionEngine
// ─────────────────────────────────────────────────────────────────────────────

describe('DecisionEngine', () => {

    it('DE1 — pool conforme 35h : toutes les raisons légales passent', () => {
        // Résultat conforme à l'interface de computeOptimalPool()
        // targetHoursPerAgent = cible hebdomadaire fournie à computeOptimalPool
        const poolResult = {
            pool                : 5,
            actualHoursPerAgent : 33.6,
            targetHoursPerAgent : 35,   // Interface computeOptimalPool — pas planningTargetWeeklyHours
            warningLevel        : 'ok',
        };

        const decision = DecisionEngine.explainPool(poolResult);

        expect(decision.blockers).toHaveLength(0);

        // La règle légale 48h doit être satisfaite
        const legalRule = decision.reasons.find(r => r.ruleId === 'LEGAL_WEEKLY_MAX');
        expect(legalRule.passed).toBe(true);

        // La règle cible hebdo doit être satisfaite
        const targetRule = decision.reasons.find(r => r.ruleId === 'WEEKLY_TARGET');
        expect(targetRule.passed).toBe(true);
    });

    it('DE2 — pool sous-dimensionné 48h+ : blockers présents', () => {
        const decision = DecisionEngine.explainPool({
            pool                     : 3,
            actualHoursPerAgent      : 56,  // 168/3 = 56h → illégal
            planningTargetWeeklyHours: 35,
            warningLevel             : 'illegal',
        });

        expect(decision.blockers.length).toBeGreaterThan(0);
        expect(decision.confidence).toBeLessThan(80);
    });

    it('DE3 — narrative générée et non vide', () => {
        const decision = DecisionEngine.explainPool({
            pool                     : 5,
            actualHoursPerAgent      : 33.6,
            planningTargetWeeklyHours: 35,
            warningLevel             : 'ok',
        });

        expect(typeof decision.narrative).toBe('string');
        expect(decision.narrative.length).toBeGreaterThan(10);
        expect(decision.narrative).toContain('5 agent');
    });

    it('DE4 — les alternatives sont transmises dans la décision', () => {
        const selected = {
            pool                     : 5,
            actualHoursPerAgent      : 33.6,
            planningTargetWeeklyHours: 35,
            estimatedScore           : 97,
            estimatedCost            : 57000,
        };
        const alternatives = [
            { pool: 4, actualHoursPerAgent: 42, planningTargetWeeklyHours: 44, estimatedScore: 82, estimatedCost: 51000, label: 'Économique' },
        ];

        const decision = DecisionEngine.explain(selected, alternatives, { planningTargetWeeklyHours: 35 });

        expect(decision.alternatives).toHaveLength(1);
        expect(decision.alternatives[0].pool).toBe(4);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SimulationEngine
// ─────────────────────────────────────────────────────────────────────────────

describe('SimulationEngine', () => {

    const BASE_CONFIG = {
        coverageHoursPerDay : 24,
        concurrentAgents    : 1,
        hourlyRate          : 25,
        periodDays          : 18,
    };

    it('SE1 — génère au moins 2 scénarios légaux pour 24h/j', () => {
        const result = SimulationEngine.run(BASE_CONFIG, PlanningPolicy.default());

        expect(result.scenarios.length).toBeGreaterThanOrEqual(2);
        result.scenarios.forEach(s => {
            expect(s).toHaveProperty('label');
            expect(s).toHaveProperty('pool');
            expect(s).toHaveProperty('estimatedScore');
            expect(s).toHaveProperty('robustness');
        });
    });

    it('SE2 — exactement un scénario est marqué isRecommended', () => {
        const result = SimulationEngine.run(BASE_CONFIG, PlanningPolicy.default());

        const recommended = result.scenarios.filter(s => s.isRecommended);
        expect(recommended).toHaveLength(1);
        expect(result.recommended).toBeTruthy();
        expect(result.recommended.pool).toBeGreaterThanOrEqual(1);
    });

    it('SE3 — la decision contient des raisons et une narrative', () => {
        const result = SimulationEngine.run(BASE_CONFIG, PlanningPolicy.default());

        expect(result.decision).toBeTruthy();
        expect(Array.isArray(result.decision.reasons)).toBe(true);
        expect(result.decision.reasons.length).toBeGreaterThan(0);
        expect(typeof result.decision.narrative).toBe('string');
    });

    it('SE4 — objectif MINIMIZE_COST → recommande le pool le plus petit légal', () => {
        const policy = PlanningPolicy.from({
            optimizationObjective: OPTIMIZATION_OBJECTIVES.MINIMIZE_COST,
        });
        const result = SimulationEngine.run(BASE_CONFIG, policy);

        const recommended = result.recommended;
        const others      = result.scenarios.filter(s => !s.isRecommended);

        // Le scénario recommandé doit avoir le plus petit pool
        others.forEach(other => {
            expect(recommended.pool).toBeLessThanOrEqual(other.pool);
        });
    });

    it('SE5 — robustesse calculée avec stars, score et description', () => {
        const result = SimulationEngine.run(BASE_CONFIG, PlanningPolicy.default());

        result.scenarios.forEach(s => {
            expect(s.robustness).toHaveProperty('score');
            expect(s.robustness).toHaveProperty('stars');
            expect(s.robustness).toHaveProperty('label');
            expect(s.robustness).toHaveProperty('description');
            expect(s.robustness.stars).toBeGreaterThanOrEqual(0);
            expect(s.robustness.stars).toBeLessThanOrEqual(5);
        });
    });

    it('SE6 — scores sous-critères (legal, fairness, fatigue, cost...) présents', () => {
        const result = SimulationEngine.run(BASE_CONFIG, PlanningPolicy.default());

        result.scenarios.forEach(s => {
            expect(s.scores).toHaveProperty('legal');
            expect(s.scores).toHaveProperty('fairness');
            expect(s.scores).toHaveProperty('fatigue');
            expect(s.scores).toHaveProperty('cost');
            expect(s.scores).toHaveProperty('global');
            expect(s.scores.global).toBeGreaterThan(0);
            expect(s.scores.global).toBeLessThanOrEqual(100);
        });
    });
});
