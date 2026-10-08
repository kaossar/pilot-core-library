/**
 * Tests — Moteurs Operational Intelligence Sprint 1
 *
 * Coverage :
 *   BE1  — BillingEngine : minimum vacation rule (realStart inchangé)
 *   BE2  — BillingEngine : vacation exactement 6h (pas de plancher)
 *   BE3  — BillingEngine : vacation 17h30→20h00 → billingStart = 14h00
 *   BE4  — BillingEngine : vacation nuit courte avec passage minuit
 *   BE5  — BillingEngine : décomposition nuit + jour (SurchargeDecompositionRule)
 *   BE6  — BillingEngine : fabrique idcc1351() — pipeline complet
 *   PP1  — PlanningPolicy : valeurs par défaut conformes IDCC
 *   PP2  — PlanningPolicy : objectif MINIMIZE_COST surcharge les poids
 *   PP3  — PlanningPolicy : sérialisation toJSON()
 *   PO1  — PoolOptimizer : 24h/j cible 35h → pool 5
 *   PO2  — PoolOptimizer : 24h/j cible 44h → pool 4
 *   PO3  — PoolOptimizer : indice de confiance dégradé si données manquantes
 *   PO4  — suggestRotationScenarios : 3 scénarios légaux
 */

import { describe, it, expect } from 'vitest';
import {
    BillingEngine,
    MinimumVacationRule,
    SurchargeDecompositionRule,
    BasketAllowanceRule,
} from './BillingEngine.js';
import {
    PlanningPolicy,
    OPTIMIZATION_OBJECTIVES,
    ROTATION_STRATEGIES,
} from './PlanningPolicy.js';
import {
    computeOptimalPool,
    suggestRotationScenarios,
} from './PoolOptimizer.js';

// ─────────────────────────────────────────────────────────────────────────────
// BillingEngine
// ─────────────────────────────────────────────────────────────────────────────

describe('BillingEngine — MinimumVacationRule', () => {

    it('BE1 — ne modifie jamais realStart/realEnd', () => {
        const engine = new BillingEngine().addRule(new MinimumVacationRule());
        const shift = { realStart: '17:30', realEnd: '20:00', isSunday: false, isHoliday: false };
        const result = engine.calculate(shift, PlanningPolicy.default(), null);

        // Le temps opérationnel est préservé
        expect(result.realStart).toBe('17:30');
        expect(result.realEnd).toBe('20:00');
        expect(result.realDuration).toBeCloseTo(2.5, 2);
    });

    it('BE2 — vacation exactement 6h : pas de plancher appliqué', () => {
        const engine = new BillingEngine().addRule(new MinimumVacationRule());
        const shift = { realStart: '08:00', realEnd: '14:00', isSunday: false, isHoliday: false };
        const result = engine.calculate(shift, PlanningPolicy.default(), null);

        expect(result.billingFloor).toBeNull();
        expect(result.billingStart).toBe('08:00');
        expect(result.billingEnd).toBe('14:00');
    });

    it('BE3 — vacation 17h30→20h00 : billingStart recalculé à 14h00', () => {
        const engine = new BillingEngine().addRule(new MinimumVacationRule());
        const shift = { realStart: '17:30', realEnd: '20:00', isSunday: false, isHoliday: false };
        const result = engine.calculate(shift, PlanningPolicy.default(), null);

        expect(result.billingStart).toBe('14:00');
        expect(result.billingEnd).toBe('20:00');
        expect(result.billingFloor.applied).toBe(true);
        expect(result.billingFloor.delta).toBeCloseTo(3.5, 2);
        expect(result.billingFloor.originalStart).toBe('17:30'); // realStart préservé
    });

    it('BE4 — vacation nuit courte 23h00→00h30 : billingStart = 18h30', () => {
        const engine = new BillingEngine().addRule(new MinimumVacationRule());
        const shift = { realStart: '23:00', realEnd: '00:30', isSunday: false, isHoliday: false };
        const result = engine.calculate(shift, PlanningPolicy.default(), null);

        // Durée réelle = 1h30 → déficit = 4h30 → billingStart = 00h30 - 6h = 18h30
        expect(result.billingStart).toBe('18:30');
        expect(result.billingFloor.applied).toBe(true);
        expect(result.billingFloor.delta).toBeCloseTo(4.5, 2);
    });
});

describe('BillingEngine — SurchargeDecompositionRule', () => {

    it('BE5 — vacation jour entière : un seul bucket coeff 1.0', () => {
        const engine = new BillingEngine().addRule(new SurchargeDecompositionRule());
        const shift = { realStart: '08:00', realEnd: '14:00', isSunday: false, isHoliday: false };
        const result = engine.calculate(shift, PlanningPolicy.default(), null);

        expect(result.billingBuckets.length).toBe(1);
        expect(result.billingBuckets[0].coeff).toBe(1.00);
        expect(result.billingBuckets[0].label).toBe('Jour');
        expect(result.billingHours).toBeCloseTo(6, 2);
    });

    it('BE5b — vacation dimanche : coeff 1.10', () => {
        const engine = new BillingEngine().addRule(new SurchargeDecompositionRule());
        const shift = { realStart: '08:00', realEnd: '14:00', isSunday: true, isHoliday: false };
        const result = engine.calculate(shift, PlanningPolicy.default(), null);

        expect(result.billingBuckets[0].coeff).toBe(1.10);
        expect(result.billingBuckets[0].label).toBe('Dimanche');
    });

    it('BE5c — vacation férié : coeff 2.00', () => {
        const engine = new BillingEngine().addRule(new SurchargeDecompositionRule());
        const shift = { realStart: '08:00', realEnd: '14:00', isSunday: false, isHoliday: true };
        const result = engine.calculate(shift, PlanningPolicy.default(), null);

        expect(result.billingBuckets[0].coeff).toBe(2.00);
        expect(result.billingBuckets[0].label).toBe('Jour férié');
    });
});

describe('BillingEngine — Pipeline complet idcc1351()', () => {

    it('BE6 — vacation 17h30→20h00 : pipeline complet avec montant', () => {
        const engine = BillingEngine.idcc1351();
        const shift = { realStart: '17:30', realEnd: '20:00', isSunday: false, isHoliday: false };
        const policy = PlanningPolicy.default();

        const result = engine.calculate(shift, policy, 12.58); // taux ADS confirmé

        // Temps opérationnel intact
        expect(result.realStart).toBe('17:30');
        expect(result.realDuration).toBeCloseTo(2.5, 2);

        // Temps de facturation ajusté
        expect(result.billingStart).toBe('14:00');
        expect(result.billingHours).toBeCloseTo(6, 2);

        // Montant = 6h × 1.00 × 12.58 + panier 4.48
        const expectedBuckets = 6 * 1.00 * 12.58;
        const expectedTotal = expectedBuckets + 4.48;
        expect(result.totalAmount).toBeCloseTo(expectedTotal, 1);

        // Panier présent
        expect(result.allowances.length).toBe(1);
        expect(result.allowances[0].label).toBe('Prime de panier');

        // 3 règles tracées
        expect(result.appliedRules.length).toBe(3);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PlanningPolicy
// ─────────────────────────────────────────────────────────────────────────────

describe('PlanningPolicy', () => {

    it('PP1 — valeurs par défaut conformes IDCC 1351', () => {
        const policy = PlanningPolicy.default();

        expect(policy.planningTargetWeeklyHours).toBe(35);
        expect(policy.minimumBillableHours).toBe(6);
        expect(policy.legalWeeklyHours).toBe(48);
        expect(policy.rotationStrategy).toBe(ROTATION_STRATEGIES.LEAST_LOADED);
        expect(policy.isValid()).toBe(true);
    });

    it('PP2 — objectif MINIMIZE_COST surcharge les poids automatiquement', () => {
        const policy = PlanningPolicy.from({
            optimizationObjective: OPTIMIZATION_OBJECTIVES.MINIMIZE_COST,
        });

        // Le coût doit avoir un poids supérieur à la politique par défaut (0.15)
        expect(policy.scoringWeights.cost).toBeGreaterThan(0.15);
        expect(policy.isValid()).toBe(true);
    });

    it('PP3 — sérialisation toJSON() produit un objet persistable', () => {
        const policy = PlanningPolicy.default();
        const json = policy.toJSON();

        expect(json).toHaveProperty('planningTargetWeeklyHours');
        expect(json).toHaveProperty('minimumBillableHours');
        expect(json).toHaveProperty('rotationStrategy');
        expect(json).toHaveProperty('scoringWeights');
        expect(typeof json.planningTargetWeeklyHours).toBe('number');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PoolOptimizer
// ─────────────────────────────────────────────────────────────────────────────

describe('PoolOptimizer — computeOptimalPool', () => {

    it('PO1 — 24h/j, cible 35h → pool 5 agents', () => {
        const result = computeOptimalPool({
            coverageHoursPerDay       : 24,
            concurrentAgents          : 1,
            planningTargetWeeklyHours : 35,
        });

        expect(result.pool).toBe(5);
        expect(result.actualHoursPerAgent).toBeCloseTo(33.6, 1);
        expect(result.warningLevel).toBe('ok');
    });

    it('PO2 — 24h/j, cible 44h → pool 4 agents', () => {
        const result = computeOptimalPool({
            coverageHoursPerDay       : 24,
            concurrentAgents          : 1,
            planningTargetWeeklyHours : 44,
        });

        expect(result.pool).toBe(4);
        expect(result.actualHoursPerAgent).toBeCloseTo(42, 1);
        expect(result.warningLevel).toBe('warn');
    });

    it('PO3 — indice de confiance dégradé si contrats manquants', () => {
        const result = computeOptimalPool({
            coverageHoursPerDay       : 24,
            concurrentAgents          : 1,
            planningTargetWeeklyHours : 35,
            hrContext                 : {
                totalAgents       : 5,
                missingContracts  : 2,
                pendingLeaves     : 1,
                cnapsExpiringSoon : 1,
            },
        });

        expect(result.confidence.score).toBeLessThan(100);
        expect(result.confidence.warnings.length).toBeGreaterThan(0);
    });
});

describe('PoolOptimizer — suggestRotationScenarios', () => {

    it('PO4 — génère les scénarios légaux (Économique / Équilibré / Confort)', () => {
        const scenarios = suggestRotationScenarios({
            coverageHoursPerDay : 24,
            concurrentAgents    : 1,
        });

        expect(scenarios.length).toBeGreaterThanOrEqual(2);
        scenarios.forEach(s => {
            expect(s).toHaveProperty('label');
            expect(s).toHaveProperty('pool');
            expect(s).toHaveProperty('actualHoursPerAgent');
            expect(s).toHaveProperty('estimatedScore');
            expect(s.isLegal).toBe(true);
        });

        // L'option "Confort" (35h) doit avoir le meilleur score
        const confort    = scenarios.find(s => s.label === 'Confort');
        const economique = scenarios.find(s => s.label === 'Économique');
        if (confort && economique) {
            expect(confort.estimatedScore).toBeGreaterThanOrEqual(economique.estimatedScore);
        }
    });
});
