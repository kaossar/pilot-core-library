/**
 * Tests MissionGenerator — G1 → G6
 * Vérifie la transformation pure ExecutionPlan → Mission[]
 *
 * @module MissionGenerator.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MissionGenerator } from './MissionGenerator.js';

// ============================================================================
// HELPERS
// ============================================================================

const makeShift = (overrides = {}) => ({
    id:       overrides.id       ?? 'shift-1',
    startAt:  overrides.startAt  ?? '2026-08-04T18:00:00.000Z',
    endAt:    overrides.endAt    ?? '2026-08-05T06:00:00.000Z',
    duration: overrides.duration ?? 12,
    unassignable: false,
    violations:   [],
    placeholder:  overrides.placeholder ?? { id: 'A', qualification: 'ads_qualifie' },
    ...overrides,
});

const makePlan = (overrides = {}) => ({
    id:      overrides.id      ?? 'plan-uuid-1',
    version: overrides.version ?? 1,
    requirements: overrides.requirements ?? [{ qualification: 'ads_qualifie', quantite: 1 }],
    constraints:  overrides.constraints  ?? { typeMission: 'GARDIENNAGE' },
    billingRulesSnapshot: overrides.billingRulesSnapshot ?? { tauxBase: 18.50 },
    approvedSnapshot: overrides.approvedSnapshot ?? {
        shifts: [makeShift()],
    },
    ...overrides,
});

const makeContext = (overrides = {}) => ({
    agencyId: overrides.agencyId ?? 'agency-uuid',
    clientId: overrides.clientId ?? 'client-uuid',
    siteId:   overrides.siteId   ?? 'site-uuid',
    devisId:  overrides.devisId  ?? 'devis-uuid',
    ...overrides,
});

// ============================================================================
// SUITE G
// ============================================================================

describe('MissionGenerator', () => {

    // ── G1 : Transformation 1:1 sans persistance ────────────────────────────

    it('G1 - 42 shifts → 42 missions plain objects (aucun INSERT BDD)', () => {
        const shifts = Array.from({ length: 42 }, (_, i) => makeShift({
            id:      `shift-${i}`,
            startAt: new Date(Date.UTC(2026, 7, 4 + i, 18, 0, 0)).toISOString(),
            endAt:   new Date(Date.UTC(2026, 7, 5 + i,  6, 0, 0)).toISOString(),
        }));
        const plan    = makePlan({ approvedSnapshot: { shifts } });
        const context = makeContext();

        const missions = MissionGenerator.generate(plan, context);

        assert.equal(missions.length, 42, '42 shifts doivent produire exactement 42 missions');

        // Vérifier qu'aucune mission n'a d'id (non persistée)
        for (const m of missions) {
            assert.ok(!m.id, 'Les missions générées ne doivent pas avoir d\'id (non persistées)');
        }
    });

    // ── G2 : Mode NOMINATIF → assignedAgents rempli ─────────────────────────

    it('G2 - Mode NOMINATIF → assignedAgents rempli dans chaque mission', () => {
        const shifts = [
            makeShift({ id: 'shift-1', placeholder: { id: 'agent-uuid-1', agentId: 'agent-uuid-1', name: 'Jean Dupont', qualification: 'ads_qualifie' } }),
            makeShift({ id: 'shift-2', placeholder: { id: 'agent-uuid-2', agentId: 'agent-uuid-2', name: 'Marc Bernard', qualification: 'ads_qualifie' } }),
        ];
        const plan    = makePlan({ approvedSnapshot: { shifts } });
        const context = makeContext();

        const missions = MissionGenerator.generate(plan, context);

        assert.equal(missions[0].assignedAgents.length, 1);
        assert.equal(missions[0].assignedAgents[0].agentId, 'agent-uuid-1');
        assert.equal(missions[0].assignedAgents[0].name, 'Jean Dupont');
        assert.equal(missions[1].assignedAgents[0].agentId, 'agent-uuid-2');
    });

    // ── G3 : Mode PREVISIONNEL → assignedAgents vide ────────────────────────

    it('G3 - Mode PREVISIONNEL → assignedAgents=[] dans chaque mission', () => {
        const shifts = [makeShift({ placeholder: { id: 'A', qualification: 'ads_qualifie' } })];
        const plan    = makePlan({ approvedSnapshot: { shifts } });
        const context = makeContext();

        const missions = MissionGenerator.generate(plan, context);

        assert.equal(missions[0].assignedAgents.length, 0, 'assignedAgents doit être vide en mode prévisionnel');
    });

    // ── G4 : simulate() → même résultat que generate() ──────────────────────

    it('G4 - simulate() retourne le même résultat que generate(), sans effet de bord', () => {
        const plan    = makePlan();
        const context = makeContext();

        const generated = MissionGenerator.generate(plan, context);
        const simulated = MissionGenerator.simulate(plan, context);

        assert.equal(simulated.length, generated.length);
        assert.deepEqual(
            simulated.map(m => m.title),
            generated.map(m => m.title),
            'simulate() et generate() doivent produire les mêmes titres'
        );
        // Vérifier l'indépendance des objets (pas de référence partagée)
        simulated[0].title = 'MODIFIE';
        assert.notEqual(generated[0].title, 'MODIFIE', 'Les résultats doivent être indépendants');
    });

    // ── G5 : approvedSnapshot absent → exception descriptive ─────────────────

    it('G5 - approvedSnapshot absent → exception avec message descriptif', () => {
        const plan = makePlan({ approvedSnapshot: null });

        assert.throws(
            () => MissionGenerator.generate(plan, makeContext()),
            /approvedSnapshot absent/,
            'Doit lever une erreur descriptive si approvedSnapshot est null'
        );
    });

    it('G5b - approvedSnapshot.shifts vide → exception', () => {
        const plan = makePlan({ approvedSnapshot: { shifts: [] } });

        assert.throws(
            () => MissionGenerator.generate(plan, makeContext()),
            /shifts.*vide/,
            'Doit lever une erreur descriptive si shifts est vide'
        );
    });

    // ── G6 : Traçabilité vers la source du plan ──────────────────────────────

    it('G6 - executionPlanId et executionPlanVersion présents dans chaque mission', () => {
        const plan    = makePlan({ id: 'plan-trace-123', version: 3 });
        const context = makeContext();

        const missions = MissionGenerator.generate(plan, context);

        for (const m of missions) {
            assert.equal(m.executionPlanId, 'plan-trace-123', 'executionPlanId doit être tracé');
            assert.equal(m.executionPlanVersion, 3, 'executionPlanVersion doit être tracé');
        }
    });

    // ── G7 : generatePeriod → filtrage par date ──────────────────────────────

    it('G7 - generatePeriod filtre les shifts hors de la période', () => {
        const shifts = [
            makeShift({ id: 's1', startAt: '2026-08-01T08:00:00.000Z', endAt: '2026-08-01T20:00:00.000Z' }),
            makeShift({ id: 's2', startAt: '2026-08-15T08:00:00.000Z', endAt: '2026-08-15T20:00:00.000Z' }),
            makeShift({ id: 's3', startAt: '2026-08-31T08:00:00.000Z', endAt: '2026-08-31T20:00:00.000Z' }),
        ];
        const plan    = makePlan({ approvedSnapshot: { shifts } });
        const context = makeContext();

        const missions = MissionGenerator.generatePeriod(
            plan,
            context,
            new Date('2026-08-10T00:00:00.000Z'),
            new Date('2026-08-20T23:59:59.000Z'),
        );

        assert.equal(missions.length, 1, 'Seul le shift du 15 août doit être inclus');
    });

    // ── G8 : Shifts à durée nulle filtrés ────────────────────────────────────

    it('G8 - Shifts de durée 0 ou négative filtrés (données corrompues)', () => {
        const shifts = [
            makeShift({ id: 's-valid', duration: 8 }),
            makeShift({ id: 's-zero',  duration: 0, startAt: '2026-08-04T08:00:00.000Z', endAt: '2026-08-04T08:00:00.000Z' }),
        ];
        const plan    = makePlan({ approvedSnapshot: { shifts } });
        const missions = MissionGenerator.generate(plan, makeContext());

        assert.equal(missions.length, 1, 'Le shift de durée 0 doit être filtré');
        assert.ok(!missions.find(m => m.startTime?.toISOString() === missions[0].endTime?.toISOString()));
    });

    // ── G9 : Context transmis fidèlement ────────────────────────────────────

    it('G9 - clientId, siteId, devisId, agencyId transmis à chaque mission', () => {
        const plan    = makePlan();
        const context = makeContext({
            agencyId: 'agency-abc',
            clientId: 'client-xyz',
            siteId:   'site-def',
            devisId:  'devis-ghi',
        });

        const missions = MissionGenerator.generate(plan, context);

        assert.equal(missions[0].agencyId, 'agency-abc');
        assert.equal(missions[0].clientId, 'client-xyz');
        assert.equal(missions[0].siteId,   'site-def');
        assert.equal(missions[0].devisId,  'devis-ghi');
    });
});
