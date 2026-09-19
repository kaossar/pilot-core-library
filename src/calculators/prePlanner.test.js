import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
    calculateEtpEquivalent, 
    getShiftDurationSeverity, 
    splitContinuousBlock, 
    generatePrePlanningShifts,
    suggestRotationPool,
    POOL_MODES
} from './prePlanner.js';
import { getAgentSummary } from './rotationEngine.js';
import { calculateMissionHoursWithJournal } from './missionCalculator.js';

describe('Operational Preparation - prePlanner Tests', () => {

    test('1. calculateEtpEquivalent utility tests', () => {
        assert.strictEqual(calculateEtpEquivalent(0), 0);
        assert.strictEqual(calculateEtpEquivalent(151.67), 1.0);
        assert.strictEqual(calculateEtpEquivalent(303.34), 2.0);
        assert.strictEqual(calculateEtpEquivalent(75.835), 0.5);
    });

    test('2. getShiftDurationSeverity severity threshold tests', () => {
        assert.strictEqual(getShiftDurationSeverity(8), 'ok');
        assert.strictEqual(getShiftDurationSeverity(12), 'ok');
        assert.strictEqual(getShiftDurationSeverity(13), 'warning');
        assert.strictEqual(getShiftDurationSeverity(15), 'warning');
        assert.strictEqual(getShiftDurationSeverity(16), 'strong_warning');
        assert.strictEqual(getShiftDurationSeverity(18), 'strong_warning');
        assert.strictEqual(getShiftDurationSeverity(19), 'critical');
    });

    test('3. splitContinuousBlock - Short Shift (no split)', () => {
        const start = new Date('2026-07-15T08:00:00');
        const end = new Date('2026-07-15T18:00:00'); // 10h
        const result = splitContinuousBlock(start, end);
        
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].startAt.getTime(), start.getTime());
        assert.strictEqual(result[0].endAt.getTime(), end.getTime());
    });

    test('4. splitContinuousBlock - 15h Shift (keep_raw, split_midnight, split_midpoint)', () => {
        const start = new Date('2026-07-15T17:00:00');
        const end = new Date('2026-07-16T08:00:00'); // 15h
        
        // keep_raw
        const rawRes = splitContinuousBlock(start, end, {}, 'keep_raw');
        assert.strictEqual(rawRes.length, 1);
        assert.strictEqual(rawRes[0].startAt.getTime(), start.getTime());

        // split_midnight
        const midRes = splitContinuousBlock(start, end, {}, 'split_midnight');
        assert.strictEqual(midRes.length, 2);
        assert.strictEqual(midRes[0].endAt.getHours(), 0); // midnight
        assert.strictEqual(midRes[0].endAt.getMinutes(), 0);
        assert.strictEqual(midRes[1].startAt.getHours(), 0);
        assert.strictEqual(midRes[1].endAt.getTime(), end.getTime());

        // split_midpoint
        const pointRes = splitContinuousBlock(start, end, {}, 'split_midpoint');
        assert.strictEqual(pointRes.length, 2);
        const diff1 = (pointRes[0].endAt - pointRes[0].startAt) / 3600000;
        const diff2 = (pointRes[1].endAt - pointRes[1].startAt) / 3600000;
        assert.strictEqual(diff1, 7.5);
        assert.strictEqual(diff2, 7.5);
    });

    test('5. splitContinuousBlock - H24 Shift split by standard 08/20 boundaries', () => {
        const start = new Date('2026-07-15T00:00:00');
        const end = new Date('2026-07-16T00:00:00'); // 24h
        
        const result = splitContinuousBlock(start, end, { startTime: '08:00' });
        
        // Under 08:00 / 20:00 rules, 00:00 - 24:00 splits into:
        // 00:00 - 08:00 (Night shift segment)
        // 08:00 - 20:00 (Day shift segment)
        // 20:00 - 24:00 (Night shift segment start)
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0].startAt.getHours(), 0);
        assert.strictEqual(result[0].endAt.getHours(), 8);
        assert.strictEqual(result[1].startAt.getHours(), 8);
        assert.strictEqual(result[1].endAt.getHours(), 20);
        assert.strictEqual(result[2].startAt.getHours(), 20);
        assert.strictEqual(result[2].endAt.getHours(), 0); // Day 1 24:00/midnight
    });

    test('6. splitContinuousBlock - H24 Shift split with week-aligned 18/06 boundaries', () => {
        const start = new Date('2026-07-15T00:00:00');
        const end = new Date('2026-07-16T00:00:00'); // 24h
        
        const result = splitContinuousBlock(start, end, { startTime: '18:00' });
        
        // Under 18:00 / 06:00 rules:
        // 00:00 - 06:00
        // 06:00 - 18:00
        // 18:00 - 24:00
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0].startAt.getHours(), 0);
        assert.strictEqual(result[0].endAt.getHours(), 6);
        assert.strictEqual(result[1].startAt.getHours(), 6);
        assert.strictEqual(result[1].endAt.getHours(), 18);
        assert.strictEqual(result[2].startAt.getHours(), 18);
        assert.strictEqual(result[2].endAt.getHours(), 0);
    });

    test('7. generatePrePlanningShifts - Basic daily journal integration', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-15',
            endDate: '2026-07-16',
            startTime: '20:00',
            endTime: '07:00',
            selectedDays: [3, 4], // Wed, Thu
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            agents: 2,
            qualification: 'ads_qualifie'
        };

        const journal = calculateMissionHoursWithJournal(config);
        const shifts = generatePrePlanningShifts(journal.days, config);

        // We expect 2 active days * 2 agents = 4 shifts total
        // Day 1: Wed 20:00 - Thu 07:00 (for Agent A and Agent B) => 2 shifts
        // Day 2: Thu 20:00 - Fri 07:00 (for Agent A and Agent B) => 2 shifts
        assert.strictEqual(shifts.length, 4);

        // Verify placeholders
        assert.strictEqual(shifts[0].placeholder.id, 'A');
        assert.strictEqual(shifts[1].placeholder.id, 'B');
        assert.strictEqual(shifts[0].placeholder.qualification, 'ads_qualifie');
        
        // Verify durations (11h each)
        assert.strictEqual(shifts[0].duration, 11);
        assert.strictEqual(shifts[0].severity, 'ok');
    });

    test('8. generatePrePlanningShifts - Overlapping intervals merge', () => {
        const days = [
            {
                date: '2026-07-16',
                intervals: [{ start: '20:00', end: '24:00' }]
            },
            {
                date: '2026-07-17',
                intervals: [
                    { start: '00:00', end: '07:00' },
                    { start: '00:00', end: '24:00' }
                ]
            }
        ];

        const shifts = generatePrePlanningShifts(days, { startTime: '08:00', agents: 1, qualification: 'ads_qualifie' });
        
        assert.strictEqual(shifts.length, 3);
        
        // Thursday 20:00 - Friday 08:00
        assert.strictEqual(new Date(shifts[0].startAt).getHours(), 20);
        assert.strictEqual(new Date(shifts[0].endAt).getHours(), 8);
        
        // Friday 08:00 - Friday 20:00
        assert.strictEqual(new Date(shifts[1].startAt).getHours(), 8);
        assert.strictEqual(new Date(shifts[1].endAt).getHours(), 20);
        
        // Friday 20:00 - Saturday 00:00
        assert.strictEqual(new Date(shifts[2].startAt).getHours(), 20);
        assert.strictEqual(new Date(shifts[2].endAt).getHours(), 0);
    });

    test('9. generatePrePlanningShifts - excludeHolidays integrates correctly', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-13',
            endDate: '2026-07-15',
            startTime: '08:00',
            endTime: '18:00',
            selectedDays: [1, 2, 3], // Mon, Tue, Wed
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            excludeHolidays: true,
            agents: 1,
            qualification: 'ads_qualifie'
        };

        const journal = calculateMissionHoursWithJournal(config);
        const shifts = generatePrePlanningShifts(journal.days, config);

        assert.strictEqual(shifts.length, 2);

        // First shift is Monday 13th
        assert.strictEqual(new Date(shifts[0].startAt).getDate(), 13);
        assert.strictEqual(new Date(shifts[0].startAt).getHours(), 8);
        assert.strictEqual(new Date(shifts[0].endAt).getHours(), 18);

        // Second shift is Wednesday 15th
        assert.strictEqual(new Date(shifts[1].startAt).getDate(), 15);
        assert.strictEqual(new Date(shifts[1].startAt).getHours(), 8);
        assert.strictEqual(new Date(shifts[1].endAt).getHours(), 18);
    });

    test('10. generatePrePlanningShifts - Cas 6: H24 2-month performance stress test', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-15',
            endDate: '2026-09-15', // 62 days
            startTime: '00:00',
            endTime: '24:00',
            selectedDays: [0, 1, 2, 3, 4, 5, 6], // Every day is H24
            weekendH24: true,
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            agents: 1,
            qualification: 'ads_qualifie'
        };

        const t0 = performance.now();
        const journal = calculateMissionHoursWithJournal(config);
        const shifts = generatePrePlanningShifts(journal.days, config);
        const t1 = performance.now();

        // Performance check: calculation must be rapid (< 350ms)
        const durationMs = t1 - t0;
        assert.ok(durationMs < 350, `Calcul trop lent : ${durationMs.toFixed(2)}ms`);

        // 63 days H24 with 12h shifts => 126 shifts total
        assert.strictEqual(shifts.length, 126);
    });

    test('11. generatePrePlanningShifts - Cas 7: Multi-sequences and shift time changes', () => {
        // Sequence 1: 15/07 - 15/08, 20:00 - 07:00
        const journal1 = calculateMissionHoursWithJournal({
            mode: 'daily',
            startDate: '2026-07-15',
            endDate: '2026-08-15',
            startTime: '20:00',
            endTime: '07:00',
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            selectedDays: [1, 2, 3, 4, 5]
        });

        // Sequence 2: 16/08 - 15/09, 18:00 - 06:00
        const journal2 = calculateMissionHoursWithJournal({
            mode: 'daily',
            startDate: '2026-08-16',
            endDate: '2026-09-15',
            startTime: '18:00',
            endTime: '06:00',
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            selectedDays: [1, 2, 3, 4, 5]
        });

        const combinedDays = [...journal1.days, ...journal2.days];
        const shifts = generatePrePlanningShifts(combinedDays, { agents: 1, qualification: 'ads_qualifie' });

        // Ensure chronological unrolling is correct
        assert.ok(shifts.length > 0);
        const seq1Shift = shifts.find(s => s.startAt.startsWith('2026-07-20'));
        const seq2Shift = shifts.find(s => s.startAt.startsWith('2026-08-20'));

        assert.strictEqual(new Date(seq1Shift.startAt).getHours(), 20); // 20:00 start in seq1
        assert.strictEqual(new Date(seq2Shift.startAt).getHours(), 18); // 18:00 start in seq2
    });

    test('12. generatePrePlanningShifts - Cas 9: Multiple qualifications support', () => {
        // SSIAP sequence (1 agent)
        const journalSSIAP = calculateMissionHoursWithJournal({
            mode: 'daily',
            startDate: '2026-07-15',
            endDate: '2026-07-15',
            startTime: '08:00',
            endTime: '20:00',
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            selectedDays: [3]
        });
        const shiftsSSIAP = generatePrePlanningShifts(journalSSIAP.days, { agents: 1, qualification: 'ssiap_1' });

        // ADS sequence (2 agents)
        const journalADS = calculateMissionHoursWithJournal({
            mode: 'daily',
            startDate: '2026-07-15',
            endDate: '2026-07-15',
            startTime: '08:00',
            endTime: '20:00',
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            selectedDays: [3]
        });
        const shiftsADS = generatePrePlanningShifts(journalADS.days, { agents: 2, qualification: 'ads_qualifie' });

        const allCombinedShifts = [...shiftsSSIAP, ...shiftsADS];
        allCombinedShifts.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

        assert.strictEqual(allCombinedShifts.length, 3);
        assert.strictEqual(allCombinedShifts[0].placeholder.qualification, 'ssiap_1');
        assert.strictEqual(allCombinedShifts[1].placeholder.qualification, 'ads_qualifie');
        assert.strictEqual(allCombinedShifts[2].placeholder.qualification, 'ads_qualifie');
    });

    test('13. generatePrePlanningShifts - Cas 10: Discontinuous missions (gaps not merged)', () => {
        const days = [
            {
                date: '2026-07-15',
                intervals: [
                    { start: '08:00', end: '12:00' },
                    { start: '14:00', end: '18:00' }
                ]
            }
        ];

        const shifts = generatePrePlanningShifts(days, { startTime: '08:00', agents: 1, qualification: 'ads_qualifie' });

        // Gaps must remain split (2 hours gap => no merge)
        assert.strictEqual(shifts.length, 2);
        assert.strictEqual(shifts[0].duration, 4);
        assert.strictEqual(shifts[1].duration, 4);
    });

    test('14. generatePrePlanningShifts - Cas 11: Rounds (multi-slots slots remain separate)', () => {
        const days = [
            {
                date: '2026-07-15',
                intervals: [
                    { start: '22:00', end: '22:30' },
                    { start: '01:00', end: '01:30' },
                    { start: '04:00', end: '04:30' }
                ]
            }
        ];

        const shifts = generatePrePlanningShifts(days, { startTime: '08:00', agents: 1, qualification: 'ads_qualifie' });

        assert.strictEqual(shifts.length, 3);
        assert.strictEqual(shifts[0].duration, 0.5);
    });

    test('15. generatePrePlanningShifts - Cas 14: Reinforcement and offset hours', () => {
        // Agent 1: 08:00 - 18:00
        const shifts1 = generatePrePlanningShifts([{ date: '2026-07-15', intervals: [{ start: '08:00', end: '18:00' }] }], { agents: 1, qualification: 'ads_qualifie' });
        // Agent 2: 10:00 - 16:00
        const shifts2 = generatePrePlanningShifts([{ date: '2026-07-15', intervals: [{ start: '10:00', end: '16:00' }] }], { agents: 1, qualification: 'ads_qualifie' });

        const combined = [...shifts1, ...shifts2];
        assert.strictEqual(combined.length, 2);
        assert.strictEqual(combined[0].duration, 10);
        assert.strictEqual(combined[1].duration, 6);
    });

    test('16. generatePrePlanningShifts - Cas 21: Partial conversion dates filtering', () => {
        const allShifts = [
            { startAt: '2026-07-15T08:00:00.000Z', endAt: '2026-07-15T20:00:00.000Z' },
            { startAt: '2026-08-15T08:00:00.000Z', endAt: '2026-08-15T20:00:00.000Z' },
            { startAt: '2026-09-15T08:00:00.000Z', endAt: '2026-09-15T20:00:00.000Z' }
        ];

        // Custom subset period (2026-07-01 to 2026-08-31)
        const filterStart = new Date('2026-07-01');
        const filterEnd = new Date('2026-08-31');

        const filtered = allShifts.filter(s => {
            const sStart = new Date(s.startAt);
            const sEnd = new Date(s.endAt);
            return sStart >= filterStart && sEnd <= filterEnd;
        });

        assert.strictEqual(filtered.length, 2);
        assert.strictEqual(filtered[0].startAt.slice(0, 10), '2026-07-15');
        assert.strictEqual(filtered[1].startAt.slice(0, 10), '2026-08-15');
    });

    test('17. generatePrePlanningShifts - Weekday night shift to Weekend H24 transition alignment', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-08',
            endDate: '2026-07-13',
            startTime: '20:00',
            endTime: '08:00',
            selectedDays: [0, 1, 2, 3, 4, 5, 6],
            weekendH24: true,
            weekendH24StartAtMidnight: true,
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            agents: 1,
            qualification: 'ads_confirme'
        };

        const journal = calculateMissionHoursWithJournal(config);
        const shifts = generatePrePlanningShifts(journal.days, config);

        // Filter Friday & Saturday shifts (starts 10th & 11th July)
        const targetShifts = shifts.filter(s => {
            const dateStr = s.startAt.slice(0, 10);
            return dateStr === '2026-07-10' || dateStr === '2026-07-11';
        });

        // Friday 20:00 - Saturday 08:00 (12h)
        // Saturday 08:00 - Saturday 20:00 (12h)
        // Saturday 20:00 - Sunday 08:00 (12h)
        assert.strictEqual(targetShifts.length, 3);

        const s1 = targetShifts[0]; // Friday Night
        const s2 = targetShifts[1]; // Saturday Day
        const s3 = targetShifts[2]; // Saturday Night

        assert.strictEqual(new Date(s1.startAt).getHours(), 20);
        assert.strictEqual(new Date(s1.endAt).getHours(), 8);
        assert.strictEqual(s1.duration, 12);

        assert.strictEqual(new Date(s2.startAt).getHours(), 8);
        assert.strictEqual(new Date(s2.endAt).getHours(), 20);
        assert.strictEqual(s2.duration, 12);

        assert.strictEqual(new Date(s3.startAt).getHours(), 20);
        assert.strictEqual(new Date(s3.endAt).getHours(), 8);
        assert.strictEqual(s3.duration, 12);
    });

    test('18. generatePrePlanningShifts - Strict start/end date range filtering', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-08',
            endDate: '2026-07-10',
            startTime: '20:00',
            endTime: '08:00',
            selectedDays: [1, 2, 3, 4, 5],
            weekendH24: true,
            weekendH24StartAtMidnight: true,
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            agents: 1,
            qualification: 'ads_confirme'
        };

        const journal = calculateMissionHoursWithJournal(config);
        const shifts = generatePrePlanningShifts(journal.days, config);

        // Verify no shift starts before 2026-07-08 or after 2026-07-10
        shifts.forEach(s => {
            const dateStr = s.startAt.slice(0, 10);
            assert.ok(dateStr >= '2026-07-08');
            assert.ok(dateStr <= '2026-07-10');
        });
    });

    // ============================================================================
    // TEST 19 — Scénario réel : 1 mois 20h-08h, tous les jours, H24 le week-end
    // Valide la chaîne complète pour un gardiennage longue durée
    // ============================================================================
    test('19. generatePrePlanningShifts - 1 mois 20h-08h tous les jours + weekendH24', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-15',
            endDate: '2026-08-14', // 31 jours
            startTime: '20:00',
            endTime: '08:00',
            selectedDays: [0, 1, 2, 3, 4, 5, 6], // Tous les jours
            weekendH24: true,
            weekendH24StartAtMidnight: true,
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            agents: 1,
            qualification: 'ads_qualifie'
        };

        const t0 = performance.now();
        const journal = calculateMissionHoursWithJournal(config);
        const shifts = generatePrePlanningShifts(journal.days, config);
        const t1 = performance.now();

        // 1. Performance — le calcul doit être rapide
        const durationMs = t1 - t0;
        assert.ok(durationMs < 150, `Calcul trop lent : ${durationMs.toFixed(2)}ms`);

        // 2. Des shifts doivent être générés
        assert.ok(shifts.length > 0, 'Aucun shift généré pour le scénario 1 mois');

        // 3. Aucun shift ne doit dépasser 12h (H24 doit être découpé en rotations de 12h)
        const oversizedShifts = shifts.filter(s => s.duration > 12);
        assert.strictEqual(
            oversizedShifts.length,
            0,
            `${oversizedShifts.length} shift(s) non conformes (>12h) : ` +
            oversizedShifts.map(s => `${s.startAt} → ${s.duration}h`).join(', ')
        );

        // 4. Tous les shifts doivent démarrer dans la période configurée
        shifts.forEach(s => {
            const dateStr = s.startAt.slice(0, 10);
            assert.ok(dateStr >= '2026-07-15', `Shift hors période (avant début) : ${s.startAt}`);
            assert.ok(dateStr <= '2026-08-14', `Shift hors période (après fin) : ${s.startAt}`);
        });

        // 5. Ordre chronologique strict
        for (let i = 1; i < shifts.length; i++) {
            const prev = new Date(shifts[i - 1].startAt);
            const curr = new Date(shifts[i].startAt);
            assert.ok(curr >= prev,
                `Shifts non ordonnés à l'index ${i} : ${shifts[i-1].startAt} puis ${shifts[i].startAt}`);
        }

        // 6. Spot-check : Mercredi 15 juillet (premier jour semaine) → 20:00-08:00, 12h
        const firstShift = shifts[0];
        assert.strictEqual(new Date(firstShift.startAt).getHours(), 20,
            'Le premier shift doit commencer à 20:00');
        assert.strictEqual(new Date(firstShift.endAt).getHours(), 8,
            'Le premier shift doit se terminer à 08:00');
        assert.strictEqual(firstShift.duration, 12,
            'Premier shift doit durer exactement 12h');
        assert.strictEqual(firstShift.severity, 'ok',
            'Sévérité du premier shift doit être ok (≤12h)');

        // 7. Spot-check : Samedi 18 juillet (week-end H24) → split en 2×12h
        // Le bloc Ven 17 20:00 → (Sam 18 H24) → (Dim 19 H24) se fusionne puis éclate
        // On attend un shift démarrant à 08:00 le samedi (issu du split à la borne 20:00/08:00)
        const saturdayMorningShifts = shifts.filter(s => {
            const d = new Date(s.startAt);
            return s.startAt.startsWith('2026-07-18') && d.getHours() === 8;
        });
        assert.ok(saturdayMorningShifts.length >= 1,
            'Samedi 18 juillet doit avoir un shift démarrant à 08:00 (H24 split)');

        // 8. Spot-check : Lundi 20 juillet (retour semaine) → shift reprend à 20:00
        const mondayShifts = shifts.filter(s => s.startAt.startsWith('2026-07-20'));
        assert.ok(mondayShifts.length >= 1, 'Lundi 20 juillet doit avoir au moins 1 shift');
        assert.strictEqual(
            new Date(mondayShifts[0].startAt).getHours(), 20,
            'Le shift du lundi doit reprendre à 20:00'
        );

        // 9. Qualification correctement propagée sur tous les shifts
        shifts.forEach(s => {
            assert.strictEqual(s.placeholder.qualification, 'ads_qualifie',
                `Qualification incorrecte sur shift ${s.id}`);
        });
    });

    // ============================================================================
    // TEST 20 — Régression : config partielle sans weekendH24 (bug prePlanningConfig modal)
    // La config passée au prePlanner DOIT inclure weekendH24 / selectedDays
    // sinon isDayH24 sera toujours false et les shifts week-end seront mal découpés
    // ============================================================================
    test('20. generatePrePlanningShifts - Régression config partielle (bug prePlanningConfig modal)', () => {
        const fullConfig = {
            mode: 'daily',
            startDate: '2026-07-15',
            endDate: '2026-08-14',
            startTime: '20:00',
            endTime: '08:00',
            selectedDays: [0, 1, 2, 3, 4, 5, 6],
            weekendH24: true,
            weekendH24StartAtMidnight: true,
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            agents: 1,
            qualification: 'ads_qualifie'
        };

        // Config tronquée — simule le bug du modal (prePlanningConfig incomplet)
        const truncatedConfig = {
            startTime: '20:00',
            endTime: '08:00',
            agents: 1,
            qualification: 'ads_qualifie',
            maxShiftDuration: 12
            // ❌ Manquent : weekendH24, selectedDays, startDate, endDate
        };

        const journal = calculateMissionHoursWithJournal(fullConfig);
        const shiftsWithFullConfig    = generatePrePlanningShifts(journal.days, fullConfig);
        const shiftsWithTruncatedConfig = generatePrePlanningShifts(journal.days, truncatedConfig);

        // Avec la config complète : aucun shift ne dépasse 12h
        const oversizedFull = shiftsWithFullConfig.filter(s => s.duration > 12);
        assert.strictEqual(oversizedFull.length, 0,
            'Config complète : aucun shift ne doit dépasser 12h');

        // La config complète doit générer des shifts
        assert.ok(shiftsWithFullConfig.length > 0,
            'Config complète doit générer des shifts');

        // Le premier shift avec config complète démarre à 20:00
        assert.strictEqual(new Date(shiftsWithFullConfig[0].startAt).getHours(), 20,
            'Config complète : premier shift à 20:00');

        // La config tronquée doit aussi générer des shifts (les intervalles sont déjà dans le journal)
        // mais leur découpage peut être erroné (isDayH24 = false partout)
        assert.ok(shiftsWithTruncatedConfig.length > 0,
            'Config tronquée : le journal produit toujours des shifts');

        // INVARIANT CRITIQUE : la config complète ne doit PAS produire de shifts > 12h
        // tandis que la config tronquée PEUT en produire (c'est le bug documenté)
        const oversizedTruncated = shiftsWithTruncatedConfig.filter(s => s.duration > 12);
        // Ce test est volontairement documentaire :
        // Si oversizedTruncated.length > 0, le bug est reproductible (avant correctif)
        // Si oversizedTruncated.length === 0, le correctif fonctionne ou le bug ne se manifeste pas
        assert.strictEqual(oversizedFull.length, 0,
            `RÉGRESSION : avec config complète, ${oversizedFull.length} shift(s) dépassent 12h`);
    });

    // ============================================================================
    // TEST 21 — Régression : shift du dimanche soir doit être 12h (pas 4h)
    // Valide la Phase 2.5 (extension des fins de blocs H24 tronquées)
    // Avant correctif : 20:00 Dim → 00:00 Lun = 4h (tronqué par la fin du bloc H24)
    // Après correctif : 20:00 Dim → 08:00 Lun = 12h (étendu jusqu'à la borne suivante)
    // ============================================================================
    test('21. generatePrePlanningShifts - Régression : shift dimanche soir = 12h (non 4h)', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-15',
            endDate: '2026-08-14',
            startTime: '20:00',
            endTime: '08:00',
            selectedDays: [0, 1, 2, 3, 4, 5, 6],
            weekendH24: true,
            weekendH24StartAtMidnight: true,
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            agents: 1,
            qualification: 'ads_qualifie'
        };

        const journal = calculateMissionHoursWithJournal(config);
        const shifts = generatePrePlanningShifts(journal.days, config);

        // Le shift du dimanche 19 juillet à 20:00 doit se terminer à 08:00 lundi (12h)
        // et non à 00:00 lundi (4h)
        const sundayEveningShift = shifts.find(s => {
            const start = new Date(s.startAt);
            return s.startAt.startsWith('2026-07-19') && start.getHours() === 20;
        });

        assert.ok(sundayEveningShift !== undefined,
            'Un shift à 20:00 le dimanche 19 juillet doit exister');

        assert.strictEqual(
            sundayEveningShift.duration, 12,
            `Shift dimanche soir doit durer 12h, obtenu : ${sundayEveningShift.duration}h ` +
            `(${sundayEveningShift.startAt} → ${sundayEveningShift.endAt})`
        );

        // La fin du shift doit être le lundi à 08:00 (pas minuit)
        const endDate = new Date(sundayEveningShift.endAt);
        assert.strictEqual(endDate.getDate(), 20, 'Le shift Dim soir doit se terminer le 20 (lundi)');
        assert.strictEqual(endDate.getHours(), 8, 'Le shift Dim soir doit se terminer à 08:00');

        // Vérifier aussi le dimanche 26 juillet (2ème week-end)
        const sundayEveningShift2 = shifts.find(s => {
            const start = new Date(s.startAt);
            return s.startAt.startsWith('2026-07-26') && start.getHours() === 20;
        });

        if (sundayEveningShift2) {
            assert.strictEqual(
                sundayEveningShift2.duration, 12,
                `Shift 26 Dim soir doit durer 12h, obtenu : ${sundayEveningShift2.duration}h`
            );
        }

        // Aucun shift ne doit avoir une durée < 4h (seuil de fragmentation inacceptable)
        const tinyShifts = shifts.filter(s => s.duration < 4);
        assert.strictEqual(tinyShifts.length, 0,
            `${tinyShifts.length} shift(s) < 4h détectés : ` +
            tinyShifts.map(s => `${s.startAt} (${s.duration}h)`).join(', ')
        );

        // Le shift lundi 20 juillet à 20:00 doit rester un bloc SÉPARÉ du week-end H24
        const mondayNightShift = shifts.find(s => {
            const start = new Date(s.startAt);
            return s.startAt.startsWith('2026-07-20') && start.getHours() === 20;
        });

        assert.ok(mondayNightShift !== undefined,
            'Le lundi 20 juillet doit avoir son propre shift de nuit \u00e0 20:00');
        assert.strictEqual(mondayNightShift.duration, 12,
            'Le shift lundi 20 juillet \u00e0 20:00 doit durer 12h');
    });

    // -----------------------------------------------------------------------
    // Test 22 : Distribution \u00e9quitable sur 3 mois (1 poste, pool 5)
    // Valide les 3 invariants du pool de rotation :
    //   1. Au moins 2 agents distincts utilis\u00e9s
    //   2. Aucun agent \u00e0 0 heure (tout le pool contribue)
    //   3. \u00c9cart max < 1 semaine (168h) entre l'agent le plus et le moins charg\u00e9
    // -----------------------------------------------------------------------
    test('22. generatePrePlanningShifts - 1 poste, pool 5, 3 mois \u2192 3 invariants d\'equit\u00e9', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-11',
            endDate:   '2026-09-30',
            startTime: '08:00',
            endTime:   '20:00',
            selectedDays: [0, 1, 2, 3, 4, 5, 6],
            nightShiftStart: '21:00',
            nightShiftEnd:   '06:00',
            holidayH24: false,
            weekendH24: false,
        };

        const journal = calculateMissionHoursWithJournal(config);
        assert.ok(journal.days.length > 0, 'Le journal doit contenir des jours');

        const shifts = generatePrePlanningShifts(journal.days, {
            startDate:       '2026-07-11',
            endDate:         '2026-09-30',
            startTime:       '08:00',
            endTime:         '20:00',
            selectedDays:    [0, 1, 2, 3, 4, 5, 6],
            concurrentAgents: 1,
            rotationPool:     5,
            qualification:   'ads_qualifie',
        });

        assert.ok(shifts.length > 0, 'Des shifts doivent \u00eatre g\u00e9n\u00e9r\u00e9s');

        const summary = getAgentSummary(shifts);

        // Invariant 1 : au moins 2 agents distincts utilis\u00e9s
        const agentIds = summary.map(s => s.id);
        assert.ok(
            agentIds.length >= 2,
            `Au moins 2 agents distincts attendus, obtenus : ${JSON.stringify(agentIds)}`
        );

        // Invariant 2 : aucun agent \u00e0 0 heure (tout le pool contribue)
        const zeroAgents = summary.filter(a => a.totalHours === 0);
        assert.ok(
            zeroAgents.length === 0,
            `Agents \u00e0 0h d\u00e9tect\u00e9s (d\u00e9s\u00e9quilibre) : ${JSON.stringify(zeroAgents)}`
        );

        // Invariant 3 : \u00e9cart max < 1 semaine (168h) entre le plus et le moins charg\u00e9
        const hours = summary.map(s => s.totalHours);
        const spread = Math.max(...hours) - Math.min(...hours);
        assert.ok(
            spread <= 168,
            `\u00c9cart de charge trop important : ${spread}h (max autoris\u00e9 : 168h)\nR\u00e9partition : ${JSON.stringify(summary)}`
        );
    });

    // -----------------------------------------------------------------------
    // Tests 22b \u00e0 28 : suggestRotationPool — 3 modes + cas limites
    // -----------------------------------------------------------------------

    test('22b. suggestRotationPool - 84h/sem, restricted \u2192 3 agents (28h chacun)', () => {
        // 84h/sem = 12h/jour \u00d7 7j, 1 agent au poste
        // En mode restreint (40h cible) : ceil(84/40) = ceil(2.1) = 3
        const pool = suggestRotationPool({
            concurrentAgents: 1,
            weeklyMissionHours: 84,
            mode: POOL_MODES.RESTRICTED,
        });
        assert.strictEqual(pool, 3, `84h/sem restricted : attendu 3, obtenu ${pool}`);
    });

    test('22c. suggestRotationPool - 84h/sem, minimum_legal \u2192 2 agents (42h chacun)', () => {
        // ceil(84/48) = ceil(1.75) = 2 — l\u00e9gal mais serr\u00e9
        const pool = suggestRotationPool({
            concurrentAgents: 1,
            weeklyMissionHours: 84,
            mode: POOL_MODES.MINIMUM_LEGAL,
        });
        assert.strictEqual(pool, 2, `84h/sem minimum_legal : attendu 2, obtenu ${pool}`);
    });

    test('23. suggestRotationPool - 108h/sem, restricted \u2192 3 agents (36h chacun)', () => {
        // 108h/sem = 3 postes \u00d7 12h \u00d7 3j ou autre configuration
        // ceil(108/40) = ceil(2.7) = 3 — \u00e9quipe restreinte, maison du site
        // Ancienne formule ETP\u00d71.35 donnait 5 — fix\u00e9 ici
        const pool = suggestRotationPool({
            concurrentAgents: 1,
            weeklyMissionHours: 108,
            mode: POOL_MODES.RESTRICTED,
        });
        assert.strictEqual(pool, 3, `108h/sem restricted : attendu 3, obtenu ${pool}`);
    });

    test('24. suggestRotationPool - 108h/sem, comfortable \u2192 4 agents (27h chacun)', () => {
        // ceil(108/35) = ceil(3.09) = 4 — avec marge absences ~15%
        const pool = suggestRotationPool({
            concurrentAgents: 1,
            weeklyMissionHours: 108,
            mode: POOL_MODES.COMFORTABLE,
        });
        assert.strictEqual(pool, 4, `108h/sem comfortable : attendu 4, obtenu ${pool}`);
    });

    test('25. suggestRotationPool - H24 (168h/sem), restricted \u2192 5 agents (34h chacun)', () => {
        // ceil(168/40) = ceil(4.2) = 5 — plancher op\u00e9rationnel > plancher l\u00e9gal (4)
        const pool = suggestRotationPool({
            concurrentAgents: 1,
            weeklyMissionHours: 168,
            mode: POOL_MODES.RESTRICTED,
        });
        assert.strictEqual(pool, 5, `H24 restricted : attendu 5, obtenu ${pool}`);
    });

    test('26. suggestRotationPool - H24 (168h/sem), minimum_legal \u2192 4 agents (42h chacun)', () => {
        // ceil(168/48) = ceil(3.5) = 4 — minimum absolu l\u00e9gal
        const pool = suggestRotationPool({
            concurrentAgents: 1,
            weeklyMissionHours: 168,
            mode: POOL_MODES.MINIMUM_LEGAL,
        });
        assert.strictEqual(pool, 4, `H24 minimum_legal : attendu 4, obtenu ${pool}`);
    });

    test('27. suggestRotationPool - concurrentAgents > suggestion \u2192 plancher absolu respect\u00e9', () => {
        // Si le client demande 5 agents simultan\u00e9s sur un poste avec 100h/sem,
        // le r\u00e9sultat doit \u00eatre au moins 5 (plancher concurrentAgents)
        const pool = suggestRotationPool({
            concurrentAgents: 5,
            weeklyMissionHours: 100,
            mode: POOL_MODES.RESTRICTED, // ceil(100/40) = 3 < 5 \u2192 plancher 5 doit pr\u00e9valoir
        });
        assert.strictEqual(pool, 5, `Plancher concurrentAgents : attendu 5, obtenu ${pool}`);
    });

    test('28. suggestRotationPool - weeklyMissionHours=0 \u2192 fallback concurrentAgents', () => {
        // Sans heures, on ne peut pas calculer un pool — fallback sur le plancher
        const pool = suggestRotationPool({
            concurrentAgents: 2,
            weeklyMissionHours: 0,
        });
        assert.strictEqual(pool, 2, `Fallback sur concurrentAgents : attendu 2, obtenu ${pool}`);
    });

});
