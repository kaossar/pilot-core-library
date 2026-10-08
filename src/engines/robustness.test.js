/**
 * Tests Sprint 4 — RobustnessEngine
 *
 * Coverage :
 *   RE1 — evaluate : pool suffisant (surplus=2) → score ≥ 85, 4+ étoiles, label Solide/Blindé
 *   RE2 — evaluate : pool minimal (surplus=0) → score 40, 1 ou 2 étoiles, alerte risque
 *   RE3 — evaluate : simulation 1-absent entièrement couverte vs non couverte
 *   RE4 — evaluate : simulation 2-absents
 *   RE5 — evaluate : détection des facteurs de risque textuels
 */

import { describe, it, expect } from 'vitest';
import { RobustnessEngine } from './RobustnessEngine.js';

describe('RobustnessEngine', () => {

    it('RE1 — pool robuste (surplus=2) : score ≥ 85, 4+ étoiles', () => {
        const report = RobustnessEngine.evaluate({
            pool: 6,
            legalMinPool: 4,
            coverageHoursPerDay: 24,
            concurrentAgents: 1,
            periodDays: 7,
        });

        expect(report.score).toBeGreaterThanOrEqual(85);
        expect(report.stars).toBeGreaterThanOrEqual(4);
        expect(report.absorbableAbsences).toBe(2);
        expect(report.scenarios).toHaveLength(2);
        expect(report.scenarios[0].isFullyCovered).toBe(true);
    });

    it('RE2 — pool minimal (surplus=0) : score 40, alerte risque', () => {
        const report = RobustnessEngine.evaluate({
            pool: 4,
            legalMinPool: 4,
            coverageHoursPerDay: 24,
            concurrentAgents: 1,
            periodDays: 7,
        });

        expect(report.score).toBeLessThanOrEqual(40);
        expect(report.stars).toBeLessThanOrEqual(2);
        expect(report.absorbableAbsences).toBe(0);
        expect(report.riskFactors.length).toBeGreaterThan(0);
    });

    it('RE3 — simulation 1-absent : détail de couverture et recommandation', () => {
        const report = RobustnessEngine.evaluate({
            pool: 5,
            legalMinPool: 4,
            coverageHoursPerDay: 24,
            concurrentAgents: 1,
            periodDays: 7,
        });

        const sc1 = report.scenarios[0];
        expect(sc1.absentAgentsCount).toBe(1);
        expect(sc1.isFullyCovered).toBe(true);
        expect(typeof sc1.recommendation).toBe('string');
    });

    it('RE4 — simulation rupture (pool < concurrentAgents)', () => {
        const report = RobustnessEngine.evaluate({
            pool: 1,
            legalMinPool: 1,
            coverageHoursPerDay: 24,
            concurrentAgents: 2, // 2 agents simultanés requis, 1 seul en pool
            periodDays: 7,
        });

        const sc1 = report.scenarios[0];
        expect(sc1.isFullyCovered).toBe(false);
        expect(sc1.recommendation).toContain('Rupture de service');
    });

    it('RE5 — liste des facteurs de risque cohérente', () => {
        const report = RobustnessEngine.evaluate({
            pool: 4,
            legalMinPool: 4,
            coverageHoursPerDay: 24,
            concurrentAgents: 1,
        });

        expect(report.riskFactors).toEqual(
            expect.arrayContaining([
                expect.stringContaining("sans aucune marge de manœuvre")
            ])
        );
    });
});
