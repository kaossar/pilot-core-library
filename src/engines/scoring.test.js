/**
 * Tests Sprint 3 — ScoringEngine multicritère
 *
 * Coverage :
 *   SC1  — legal : pool 35h conforme → score ≥ 90
 *   SC2  — legal : pool illégal 56h  → score = 0
 *   SC3  — legal : zone majorée 44–48h → score intermédiaire < 90
 *   SC4  — fairness : distribution équitable → score ≥ 85
 *   SC5  — fairness : distribution inégale (σ élevé) → score < 50
 *   SC6  — cost : estimatedCost disponible → ratio correct
 *   SC7  — robustness : surplus=0 → score 40, surplus=2 → score 85
 *   SC8  — evaluate : score global pondéré cohérent avec les poids
 *   SC9  — evaluate : dégrade gracieusement si données partielles
 *   SC10 — evaluateFromPool : intégration avec SimulationEngine (régression)
 *   SE7  — SimulationEngine : scores dynamiques après intégration ScoringEngine
 */

import { describe, it, expect } from 'vitest';
import { ScoringEngine } from './ScoringEngine.js';
import { SimulationEngine } from './SimulationEngine.js';
import { PlanningPolicy, OPTIMIZATION_OBJECTIVES } from './PlanningPolicy.js';

const DEFAULT_POLICY = PlanningPolicy.default();

// ─────────────────────────────────────────────────────────────────────────────
// SC1–SC3 — Dimension LEGAL
// ─────────────────────────────────────────────────────────────────────────────

describe('ScoringEngine — Dimension legal', () => {

    it('SC1 — pool 33.6h/sem (< 35h cible) : score legal ≥ 95', () => {
        const scores = ScoringEngine.evaluate({
            actualHoursPerAgent      : 33.6,
            planningTargetWeeklyHours: 35,
        }, DEFAULT_POLICY);

        expect(scores.legal).toBeGreaterThanOrEqual(95);
    });

    it('SC2 — pool illégal 56h/sem (> 48h max) : score legal = 0', () => {
        const scores = ScoringEngine.evaluate({
            actualHoursPerAgent      : 56,
            planningTargetWeeklyHours: 35,
        }, DEFAULT_POLICY);

        expect(scores.legal).toBe(0);
    });

    it('SC3 — zone majorée 46h/sem (44–48h) : score legal intermédiaire < 90', () => {
        const scores = ScoringEngine.evaluate({
            actualHoursPerAgent      : 46,
            planningTargetWeeklyHours: 35,
        }, DEFAULT_POLICY);

        expect(scores.legal).toBeLessThan(90);
        expect(scores.legal).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC4–SC5 — Dimension FAIRNESS
// ─────────────────────────────────────────────────────────────────────────────

describe('ScoringEngine — Dimension fairness', () => {

    it('SC4 — distribution équitable (σ proche 0) : score ≥ 90', () => {
        const scores = ScoringEngine.evaluate({
            agentHoursDistribution: [35, 35, 35, 35, 35],  // Variance nulle
            actualHoursPerAgent   : 35,
            pool                  : 5,
        }, DEFAULT_POLICY);

        expect(scores.fairness).toBeGreaterThanOrEqual(90);
    });

    it('SC5 — distribution très inégale (certains surchargés) : score < 50', () => {
        const scores = ScoringEngine.evaluate({
            agentHoursDistribution: [10, 60, 10, 60, 10],  // Variance très élevée
            actualHoursPerAgent   : 30,
            pool                  : 5,
        }, DEFAULT_POLICY);

        expect(scores.fairness).toBeLessThan(50);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC6 — Dimension COST
// ─────────────────────────────────────────────────────────────────────────────

describe('ScoringEngine — Dimension cost', () => {

    it('SC6 — coût optimal = coût estimé : score cost = 100', () => {
        const scores = ScoringEngine.evaluate({
            estimatedCost : 57000,
            optimalCost   : 57000,  // Identique → pas de surcoût
            pool          : 5,
            legalMinPool  : 4,
        }, DEFAULT_POLICY);

        expect(scores.cost).toBe(100);
    });

    it('SC6b — surcoût de 30% vs optimal : score cost ≈ 0', () => {
        const scores = ScoringEngine.evaluate({
            estimatedCost : 74100,   // +30% vs 57000
            optimalCost   : 57000,
        }, DEFAULT_POLICY);

        expect(scores.cost).toBeLessThanOrEqual(5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC7 — Dimension ROBUSTNESS
// ─────────────────────────────────────────────────────────────────────────────

describe('ScoringEngine — Dimension robustness', () => {

    it('SC7a — surplus=0 (pool = minimum légal) : score 40 (fragile)', () => {
        const scores = ScoringEngine.evaluate({
            pool         : 4,
            legalMinPool : 4,   // Pas de surplus
        }, DEFAULT_POLICY);

        expect(scores.robustness).toBe(40);
    });

    it('SC7b — surplus=2 (pool 2 agents au-dessus du min) : score 85 (solide)', () => {
        const scores = ScoringEngine.evaluate({
            pool         : 6,
            legalMinPool : 4,   // Surplus = 2
        }, DEFAULT_POLICY);

        expect(scores.robustness).toBe(85);
    });

    it('SC7c — surplus=1 : score 70 (correct)', () => {
        const scores = ScoringEngine.evaluate({
            pool         : 5,
            legalMinPool : 4,   // Surplus = 1
        }, DEFAULT_POLICY);

        expect(scores.robustness).toBe(70);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC8–SC9 — Score global
// ─────────────────────────────────────────────────────────────────────────────

describe('ScoringEngine — Score global', () => {

    it('SC8 — score global cohérent avec les poids de la policy', () => {
        const data = {
            pool                    : 5,
            legalMinPool            : 4,
            actualHoursPerAgent     : 33.6,
            planningTargetWeeklyHours: 35,
            agentHoursDistribution  : [33, 34, 34, 34, 33],
        };

        const scores = ScoringEngine.evaluate(data, DEFAULT_POLICY);

        // Le score global est dans [0, 100]
        expect(scores.global).toBeGreaterThanOrEqual(0);
        expect(scores.global).toBeLessThanOrEqual(100);

        // Un pool conforme à 35h doit avoir un bon score global
        expect(scores.global).toBeGreaterThan(75);

        // Les 6 dimensions sont présentes
        ['legal', 'fairness', 'fatigue', 'cost', 'availability', 'robustness'].forEach(dim => {
            expect(typeof scores[dim]).toBe('number');
        });
    });

    it('SC9 — dégrade gracieusement si données partielles (seulement actualHoursPerAgent)', () => {
        const scores = ScoringEngine.evaluate({
            actualHoursPerAgent: 35,
            // Pas de pool, pas de coûts, pas de distribution
        }, DEFAULT_POLICY);

        // Ne doit pas planter, retourner des scores valides
        expect(scores.global).toBeGreaterThan(0);
        expect(scores.global).toBeLessThanOrEqual(100);
        expect(scores.detail).toBeTruthy();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC10 — evaluateFromPool
// ─────────────────────────────────────────────────────────────────────────────

describe('ScoringEngine — evaluateFromPool', () => {

    it('SC10 — évalue depuis un scénario PoolOptimizer', () => {
        const poolScenario = {
            pool                    : 5,
            actualHoursPerAgent     : 33.6,
            planningTargetWeeklyHours: 35,
            warningLevel            : 'ok',
            estimatedCost           : 57000,
        };

        const scores = ScoringEngine.evaluateFromPool(poolScenario, 4, DEFAULT_POLICY);

        expect(scores.global).toBeGreaterThan(0);
        expect(scores.legal).toBeGreaterThanOrEqual(95);
        expect(scores.robustness).toBe(70); // surplus = 5 - 4 = 1
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SE7 — Régression SimulationEngine (scores dynamiques)
// ─────────────────────────────────────────────────────────────────────────────

describe('SimulationEngine — intégration ScoringEngine (régression)', () => {

    it('SE7 — les scores de SimulationEngine sont maintenant dynamiques (pas statiques)', () => {
        const result = SimulationEngine.run({
            coverageHoursPerDay : 24,
            concurrentAgents    : 1,
            periodDays          : 18,
        }, DEFAULT_POLICY);

        result.scenarios.forEach(s => {
            // Le score doit être présent et non-statique
            expect(s.estimatedScore).toBeGreaterThan(0);
            expect(s.estimatedScore).toBeLessThanOrEqual(100);

            // Les détails de scoring doivent être présents (ScoringEngine les inclut)
            expect(s.scores).toHaveProperty('detail');
            expect(s.scores).toHaveProperty('weights');
        });

        // Vérification que les scores sont bien dynamiques :
        // le scénario Confort (plus de pool) doit avoir une meilleure robustesse
        const confort    = result.scenarios.find(s => s.label === 'Confort');
        const economique = result.scenarios.find(s => s.label === 'Économique');
        if (confort && economique) {
            // Plus de pool → meilleure robustesse (invariant physique)
            expect(confort.scores.robustness).toBeGreaterThanOrEqual(economique.scores.robustness);
            // Les scores doivent être différents (preuve que le calcul est dynamique)
            expect(confort.estimatedScore).not.toBe(economique.estimatedScore);
        }
    });
});
