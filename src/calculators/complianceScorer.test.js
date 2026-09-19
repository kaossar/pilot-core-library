/**
 * Tests du score de conformité IDCC 1351
 * C1 → C6 — selon le plan architectural ExecutionPlan v3
 *
 * @module complianceScorer.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildComplianceScore, buildConformanceWarnings } from './complianceScorer.js';
import { VIOLATIONS } from './rotationEngine.js';

// ============================================================================
// HELPERS — construction de fixtures
// ============================================================================

/** Crée un shift assigné minimal */
const makeShift = (overrides = {}) => ({
    id:          overrides.id ?? 'shift-1',
    startAt:     overrides.startAt ?? '2026-08-04T08:00:00.000Z',
    endAt:       overrides.endAt   ?? '2026-08-04T20:00:00.000Z',
    duration:    overrides.duration ?? 12,
    unassignable: overrides.unassignable ?? false,
    violations:  overrides.violations ?? [],
    placeholder: overrides.placeholder ?? { id: 'A', qualification: 'ads_qualifie' },
    ...overrides,
});

/** Crée un résumé agent minimal (résultat de getAgentSummary) */
const makeAgentSummary = (overrides = {}) => ({
    id:                       overrides.id ?? 'A',
    totalHours:               overrides.totalHours ?? 100,
    shiftsCount:              overrides.shiftsCount ?? 10,
    unassigned:               overrides.unassigned ?? 0,
    minVacationViolationCount: overrides.minVacationViolationCount ?? 0,
    weeklyHoursMap:           overrides.weeklyHoursMap ?? {},
    rolling12WAvgMax:         overrides.rolling12WAvgMax ?? 35,
    rolling12WViolation:      overrides.rolling12WViolation ?? false,
    sundayWorkedByMonth:      overrides.sundayWorkedByMonth ?? {},
    sundayRestByMonth:        overrides.sundayRestByMonth ?? {},
    sundayViolation:          overrides.sundayViolation ?? false,
    ...overrides,
});

// ============================================================================
// SUITE C
// ============================================================================

describe('complianceScorer', () => {

    // ── C1 : Planning vide ──────────────────────────────────────────────────

    it('C1 - Planning vide → score=100, warnings=[]', () => {
        const score    = buildComplianceScore([], []);
        const warnings = buildConformanceWarnings([], []);

        assert.equal(score, 100, 'Score attendu : 100 pour un planning sans shifts');
        assert.deepEqual(warnings, [], 'Aucun avertissement pour un planning vide');
    });

    it('C1b - shifts=null → score=100', () => {
        assert.equal(buildComplianceScore(null, []), 100);
    });

    // ── C2 : Shift non assignable ───────────────────────────────────────────

    it('C2 - 1 shift non assignable → score < 75, warning UNASSIGNABLE présent', () => {
        const shifts = [makeShift({ unassignable: true, severity: 'critical' })];
        const score  = buildComplianceScore(shifts, []);
        const warns  = buildConformanceWarnings(shifts, []);

        assert.ok(score <= 75, `Score ${score} devrait être <= 75 (pénalité -25)`);
        assert.equal(score, 75, 'Score exact attendu : 75 (100 - 25)');
        assert.ok(warns.some(w => w.code === 'UNASSIGNABLE'), 'Warning UNASSIGNABLE attendu');
        assert.ok(warns.some(w => w.severity === 'critical'), 'Sévérité critical attendue');
    });

    it('C2b - 4 shifts non assignables → score = 0 (borné)', () => {
        const shifts = Array.from({ length: 4 }, (_, i) =>
            makeShift({ id: `shift-${i}`, unassignable: true })
        );
        const score = buildComplianceScore(shifts, []);
        // 100 - 4 * 25 = 0
        assert.equal(score, 0, 'Score doit être borné à 0 (pas négatif)');
    });

    // ── C3 : Moyenne rolling 12 semaines > 44h ──────────────────────────────

    it('C3 - Agent rolling12W > 44h → warning ROLLING_AVG_12W_EXCEEDED, score pénalisé', () => {
        const shifts = [makeShift()];
        const summary = [makeAgentSummary({
            rolling12WAvgMax:    46.5,
            rolling12WViolation: true,
        })];

        const score = buildComplianceScore(shifts, summary);
        const warns = buildConformanceWarnings(shifts, summary);

        assert.ok(score < 100, `Score ${score} devrait être pénalisé`);
        assert.equal(score, 80, 'Score exact : 100 - 20 = 80');
        assert.ok(
            warns.some(w => w.code === VIOLATIONS.ROLLING_AVG_12W_EXCEEDED),
            'Warning ROLLING_AVG_12W_EXCEEDED attendu'
        );
    });

    // ── C4 : Dimanches de repos insuffisants ────────────────────────────────

    it('C4 - < 2 dim repos/mois → warning SUNDAY_REST_INSUFFICIENT, pénalité -10 par mois', () => {
        const shifts = [makeShift()];
        const summary = [makeAgentSummary({
            sundayRestByMonth: { '2026-08': 1 },  // 1 seul dimanche de repos — insuffisant
            sundayViolation:   true,
        })];

        const score = buildComplianceScore(shifts, summary);
        const warns = buildConformanceWarnings(shifts, summary);

        assert.equal(score, 90, 'Score : 100 - 10 (1 mois en violation dimanche) = 90');
        assert.ok(
            warns.some(w => w.code === VIOLATIONS.SUNDAY_REST_INSUFFICIENT),
            'Warning SUNDAY_REST_INSUFFICIENT attendu'
        );
        assert.ok(
            warns.some(w => w.detail?.includes('2026-08')),
            'Le mois en violation doit apparaître dans le détail'
        );
    });

    it('C4b - 2 dim repos OK → pas de pénalité Sunday', () => {
        const shifts = [makeShift()];
        const summary = [makeAgentSummary({
            sundayRestByMonth: { '2026-08': 2 },  // conforme
            sundayViolation:   false,
        })];
        assert.equal(buildComplianceScore(shifts, summary), 100);
        assert.equal(buildConformanceWarnings(shifts, summary).length, 0);
    });

    // ── C5 : Cumul violations → score borné [0, 100] ────────────────────────

    it('C5 - Cumul violations → score non négatif, borné à 0', () => {
        const shifts = [
            makeShift({ id: 's1', unassignable: true }),
            makeShift({ id: 's2', unassignable: true }),
            makeShift({ id: 's3', violations: [VIOLATIONS.MAX_WEEKLY_HOURS] }),
            makeShift({ id: 's4', violations: [VIOLATIONS.MIN_WEEKLY_REST] }),
            makeShift({ id: 's5', violations: [VIOLATIONS.MIN_VACATION_HOURS] }),
        ];
        const summary = [makeAgentSummary({ rolling12WViolation: true })];

        const score = buildComplianceScore(shifts, summary);

        assert.ok(score >= 0, `Score ${score} ne doit jamais être négatif`);
        assert.ok(score <= 100, `Score ${score} ne doit jamais dépasser 100`);
        assert.equal(score, 0, 'Score borné à 0 pour cumul de violations critiques');
    });

    // ── C6 : Score arrondi à l'entier ───────────────────────────────────────

    it('C6 - Score retourné est toujours un entier', () => {
        const shifts  = [makeShift({ violations: [VIOLATIONS.MIN_VACATION_HOURS] })];
        const score   = buildComplianceScore(shifts, []);

        assert.equal(typeof score, 'number', 'Score doit être un number');
        assert.equal(score, Math.round(score), 'Score doit être un entier (pas de décimales)');
        assert.equal(score, 95, 'Score : 100 - 5 (vacation < 6h) = 95');
    });

    // ── C7 : Warnings structurés ────────────────────────────────────────────

    it('C7 - Vacation < 6h → warning MIN_VACATION_HOURS avec severity warning', () => {
        const shifts = [makeShift({
            id: 'short-shift',
            duration: 4,
            violations: [VIOLATIONS.MIN_VACATION_HOURS],
            placeholder: { id: 'A', qualification: 'ads_qualifie' },
        })];
        const warns = buildConformanceWarnings(shifts, []);

        const vacWarn = warns.find(w => w.code === VIOLATIONS.MIN_VACATION_HOURS);
        assert.ok(vacWarn, 'Warning MIN_VACATION_HOURS attendu');
        assert.equal(vacWarn.severity, 'warning');
        assert.ok(vacWarn.detail?.includes('4.0h'), 'La durée doit apparaître dans le détail');
        assert.equal(vacWarn.shiftId, 'short-shift');
        assert.equal(vacWarn.agentId, 'A');
    });

    it('C8 - Plusieurs mois en violation dimanches → autant de warnings', () => {
        const shifts = [makeShift()];
        const summary = [makeAgentSummary({
            sundayRestByMonth: {
                '2026-08': 1,   // violation
                '2026-09': 2,   // conforme
                '2026-10': 0,   // violation
            },
        })];

        const warns = buildConformanceWarnings(shifts, summary);
        const sundayWarns = warns.filter(w => w.code === VIOLATIONS.SUNDAY_REST_INSUFFICIENT);

        assert.equal(sundayWarns.length, 2, '2 mois en violation → 2 warnings');
    });
});
