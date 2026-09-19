import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateMissionHoursWithJournal, formatDailyJournalAsText, calculateDayDetails } from './missionCalculator.js';

describe('Mission Calculator Engine Tests', () => {

    test('1. Standard Day Shift (Weekdays, no H24, no overnight)', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-06-22', // Monday
            endDate: '2026-06-26',   // Friday
            startTime: '08:00',
            endTime: '18:00',
            selectedDays: [1, 2, 3, 4, 5], // Mon-Fri
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: false,
            holidayH24: false
        };

        const result = calculateMissionHoursWithJournal(config);
        
        // 5 active days * 10h per day = 50h total
        assert.strictEqual(result.totalHours, 50);
        assert.strictEqual(result.buckets.weekdayDay, 50);
        assert.strictEqual(result.buckets.weekdayNight, 0);
    });

    test('2. Standard Overnight Shift (Weekdays, overnight, no H24)', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-06-22', // Monday
            endDate: '2026-06-23',   // Tuesday
            startTime: '21:00',
            endTime: '06:00',
            selectedDays: [1, 2], // Mon, Tue
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: false,
            holidayH24: false
        };

        const result = calculateMissionHoursWithJournal(config);
        
        // Monday shift: Mon 21:00 -> Tue 06:00 (9h night)
        // Tuesday shift: Tue 21:00 -> Wed 06:00 (9h night)
        // Total = 18h night
        assert.strictEqual(result.totalHours, 18);
        assert.strictEqual(result.buckets.weekdayNight, 18);
    });

    test('3. Weekend H24 Shift (Saturday/Sunday, overnight, H24 enabled) - Bug Scenario', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-06-22',
            endDate: '2026-08-31',
            startTime: '15:00',
            endTime: '07:00',
            selectedDays: [0, 6], // Saturday (6) and Sunday (0)
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: true,
            holidayH24: false
        };

        const result = calculateMissionHoursWithJournal(config);
        
        // Let's check Saturday 27 June, Sunday 28 June, and Monday 29 June
        const saturday = result.days.find(d => d.date === '2026-06-27');
        const sunday = result.days.find(d => d.date === '2026-06-28');
        const monday = result.days.find(d => d.date === '2026-06-29');

        // Le samedi H24 doit commencer à 00:00 et aller jusqu'à 24:00 (24h au total)
        // (00:00 -> 06:00 = 6h nuit, 06:00 -> 21:00 = 15h jour, 21:00 -> 24:00 = 3h nuit)
        assert.strictEqual(saturday.totalHours, 24);
        assert.strictEqual(saturday.buckets.weekdayDay, 15);
        assert.strictEqual(saturday.buckets.weekdayNight, 9);

        // Sunday is weekend H24 and should cover 00:00 -> 24:00 (24h total)
        // (00:00 -> 06:00 = 6h night, 06:00 -> 21:00 = 15h day, 21:00 -> 24:00 = 3h night)
        assert.strictEqual(sunday.totalHours, 24);
        assert.strictEqual(sunday.buckets.sundayDay, 15);
        assert.strictEqual(sunday.buckets.sundayNight, 9);

        // Monday is weekday, not selected, but recovers the overnight part of Sunday: 00:00 -> 07:00 (7h total)
        // (00:00 -> 06:00 = 6h night, 06:00 -> 07:00 = 1h day)
        assert.strictEqual(monday.totalHours, 7);
        assert.strictEqual(monday.buckets.weekdayDay, 1);
        assert.strictEqual(monday.buckets.weekdayNight, 6);
    });

    test('4. Weekend H24 Shift with Friday active (Overlapping shifts)', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-06-26', // Friday
            endDate: '2026-06-28',   // Sunday
            startTime: '15:00',
            endTime: '07:00',
            selectedDays: [1, 2, 3, 4, 5, 6, 0], // Every day active
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: true,
            holidayH24: false
        };

        const result = calculateMissionHoursWithJournal(config);
        
        const friday = result.days.find(d => d.date === '2026-06-26');
        const saturday = result.days.find(d => d.date === '2026-06-27');

        // Friday is active, not weekend, so it starts at 15:00 and gets truncated to 24:00 (midnight)
        // because Saturday next day is H24. So Friday covers 15:00 -> 24:00 (9h total: 6h day, 3h night).
        assert.strictEqual(friday.totalHours, 9);
        assert.strictEqual(friday.buckets.weekdayDay, 6);
        assert.strictEqual(friday.buckets.weekdayNight, 3);

        // Saturday is weekend H24. Since Friday spilled into Saturday, Saturday starts at 00:00 and covers 24h.
        assert.strictEqual(saturday.totalHours, 24);
    });

    test('5. Holiday H24 Shift (Weekday Holiday)', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-13', // Monday
            endDate: '2026-07-15',   // Wednesday (July 14 is Bastille Day - Public Holiday)
            startTime: '08:00',
            endTime: '18:00',
            selectedDays: [1, 2, 3], // Mon, Tue, Wed
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: false,
            holidayH24: true
        };

        const result = calculateMissionHoursWithJournal(config);
        
        const monday = result.days.find(d => d.date === '2026-07-13');
        const tuesdayHoliday = result.days.find(d => d.date === '2026-07-14'); // Bastille Day
        const wednesday = result.days.find(d => d.date === '2026-07-15');

        // Monday is standard shift: 08:00 -> 18:00 (10h day)
        assert.strictEqual(monday.totalHours, 10);
        assert.strictEqual(monday.buckets.weekdayDay, 10);

        // Le mardi est férié H24. Par défaut, il doit commencer à 00:00 et couvrir 24h.
        // (00:00 -> 06:00 = 6h nuit férié, 06:00 -> 21:00 = 15h jour férié, 21:00 -> 24:00 = 3h nuit férié)
        assert.strictEqual(tuesdayHoliday.totalHours, 24);
        assert.strictEqual(tuesdayHoliday.buckets.holidayDay, 15);
        assert.strictEqual(tuesdayHoliday.buckets.holidayNight, 9);

        // Wednesday is standard active day. Tuesday ended at 24:00 (which is Wednesday 00:00).
        // Since Wednesday is active, it starts at 08:00 -> 18:00 (10h day)
        assert.strictEqual(wednesday.totalHours, 10);
        assert.strictEqual(wednesday.buckets.weekdayDay, 10);
    });

    test('6. formatDailyJournalAsText with custom day agents and qualifications', () => {
        const mockDays = [
            {
                date: '2026-06-22',
                weekday: 1,
                isWeekend: false,
                isSunday: false,
                isHoliday: false,
                intervals: [{ start: '08:00', end: '20:00', category: 'weekdayDay', hours: 12 }],
                buckets: {
                    weekdayDay: 12,
                    weekdayNight: 0,
                    sundayDay: 0,
                    sundayNight: 0,
                    holidayDay: 0,
                    holidayNight: 0,
                    sundayHolidayDay: 0,
                    sundayHolidayNight: 0
                },
                totalHours: 12,
                agents: 2,
                qualification: 'Agent de sécurité qualifié'
            },
            {
                date: '2026-06-27',
                weekday: 6,
                isWeekend: true,
                isSunday: false,
                isHoliday: false,
                intervals: [{ start: '15:00', end: '24:00', category: 'weekdayDay', hours: 9 }],
                buckets: {
                    weekdayDay: 9,
                    weekdayNight: 0,
                    sundayDay: 0,
                    sundayNight: 0,
                    holidayDay: 0,
                    holidayNight: 0,
                    sundayHolidayDay: 0,
                    sundayHolidayNight: 0
                },
                totalHours: 9,
                agents: 1,
                qualification: 'SSIAP 1'
            }
        ];

        const result = formatDailyJournalAsText(mockDays);
        
        // Vérifier que la première ligne utilise "2x Agent de sécurité qualifié" et multiplie les heures de jour par 2 (12 * 2 = 24.0)
        assert.ok(result.includes('22/06/2026 (Lun) 2x Agent de sécurité qualifié [08:00-20:00] : 24.0 h jour'));
        
        // Vérifier que la deuxième ligne utilise "1x SSIAP 1" et conserve les heures de jour (9 * 1 = 9.0)
        assert.ok(result.includes('27/06/2026 (Sam) 1x SSIAP 1 [15:00-24:00] : 9.0 h jour'));
    });

    test('7. calculateMissionHoursWithJournal injects default agents and qualification in daily journal', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-06-22',
            endDate: '2026-06-22',
            startTime: '08:00',
            endTime: '12:00',
            selectedDays: [1],
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: false,
            holidayH24: false,
            agents: 3,
            qualification: 'ads_qualifie'
        };

        const result = calculateMissionHoursWithJournal(config);
        
        const day = result.days.find(d => d.date === '2026-06-22');
        assert.strictEqual(day.agents, 3);
        assert.strictEqual(day.qualification, 'ads_qualifie');
    });

    test('8. Le week-end H24 commence à 00:00 par défaut (sauf premier jour global)', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-06-22', // Lundi
            endDate: '2026-06-28',   // Dimanche
            startTime: '15:00',
            endTime: '07:00',
            selectedDays: [0, 6], // Samedi, Dimanche
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: true,
            holidayH24: false
        };

        const result = calculateMissionHoursWithJournal(config);
        const saturday = result.days.find(d => d.date === '2026-06-27');
        
        // Le samedi n'est pas le premier jour global (qui est le 22/06)
        // Il doit donc commencer à 00:00 et couvrir 24h
        assert.strictEqual(saturday.totalHours, 24);
        assert.strictEqual(saturday.intervals[0].start, '00:00');
    });

    test('9. Le week-end H24 commence à startTime si weekendH24StartAtMidnight est false', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-06-22', // Lundi
            endDate: '2026-06-28',   // Dimanche
            startTime: '15:00',
            endTime: '07:00',
            selectedDays: [0, 6], // Samedi, Dimanche
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: true,
            holidayH24: false,
            weekendH24StartAtMidnight: false
        };

        const result = calculateMissionHoursWithJournal(config);
        const saturday = result.days.find(d => d.date === '2026-06-27');
        
        // Le samedi doit commencer à startTime (15:00) et aller jusqu'à 24:00 (9 heures au total)
        assert.strictEqual(saturday.totalHours, 9);
        assert.strictEqual(saturday.intervals[0].start, '15:00');
    });

    test('10. Le jour férié H24 commence à 00:00 par défaut (sauf premier jour global)', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-13', // Lundi
            endDate: '2026-07-15',   // Mercredi (Mardi 14/07 férié)
            startTime: '08:00',
            endTime: '18:00',
            selectedDays: [2], // Mardi (14/07)
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: false,
            holidayH24: true
        };

        const result = calculateMissionHoursWithJournal(config);
        const holiday = result.days.find(d => d.date === '2026-07-14');
        
        // Le 14/07 férié n'est pas le premier jour global. Il doit donc commencer à 00:00 et couvrir 24h.
        assert.strictEqual(holiday.totalHours, 24);
        assert.strictEqual(holiday.intervals[0].start, '00:00');
    });

    test('11. Le jour férié H24 commence à startTime si holidayH24StartAtMidnight est false', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-13', // Lundi
            endDate: '2026-07-15',   // Mercredi (Mardi 14/07 férié)
            startTime: '08:00',
            endTime: '18:00',
            selectedDays: [2], // Mardi (14/07)
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: false,
            holidayH24: true,
            holidayH24StartAtMidnight: false
        };

        const result = calculateMissionHoursWithJournal(config);
        const holiday = result.days.find(d => d.date === '2026-07-14');
        
        // Le 14/07 férié doit commencer à startTime (08:00) et aller jusqu'à 24:00 (16 heures au total)
        assert.strictEqual(holiday.totalHours, 16);
        assert.strictEqual(holiday.intervals[0].start, '08:00');
    });

    test('12. Le week-end H24 : samedi commence à startTime mais dimanche commence à 00:00 si weekendH24StartAtMidnight est false (consécutif)', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-06-22', // Lundi
            endDate: '2026-06-28',   // Dimanche
            startTime: '15:00',
            endTime: '07:00',
            selectedDays: [0, 6], // Samedi, Dimanche
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: true,
            holidayH24: false,
            weekendH24StartAtMidnight: false
        };

        const result = calculateMissionHoursWithJournal(config);
        const saturday = result.days.find(d => d.date === '2026-06-27');
        const sunday = result.days.find(d => d.date === '2026-06-28');
        
        // Samedi 27/06 (premier jour) doit commencer à startTime (15:00)
        assert.strictEqual(saturday.totalHours, 9);
        assert.strictEqual(saturday.intervals[0].start, '15:00');

        // Dimanche 28/06 (consécutif) doit commencer à 00:00 et couvrir 24h
        assert.strictEqual(sunday.totalHours, 24);
        assert.strictEqual(sunday.intervals[0].start, '00:00');
    });

    test('13. Le jour férié H24 consécutif commence à 00:00 si holidayH24StartAtMidnight est false', () => {
        // Simuler deux jours fériés successifs (ex: 25/12 et 26/12)
        const config = {
            mode: 'daily',
            startDate: '2026-12-24',
            endDate: '2026-12-26',
            startTime: '08:00',
            endTime: '18:00',
            selectedDays: [4, 5, 6], // Jeu, Ven, Sam
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            weekendH24: false,
            holidayH24: true,
            holidayH24StartAtMidnight: false
        };

        // Créer un cache où le 25 et le 26 sont fériés
        const customHolidayCache = new Map();
        customHolidayCache.set(new Date(2026, 11, 25).toDateString(), true);
        customHolidayCache.set(new Date(2026, 11, 26).toDateString(), true);

        // Appel direct du calcul de détail quotidien
        const day1 = calculateDayDetails('2026-12-25', config, customHolidayCache);
        const day2 = calculateDayDetails('2026-12-26', config, customHolidayCache);

        // Le premier jour férié (25/12) commence à startTime (08:00)
        assert.strictEqual(day1.totalHours, 16);
        assert.strictEqual(day1.intervals[0].start, '08:00');

        // Le second jour férié (26/12) est consécutif, il doit donc commencer à 00:00 et faire 24h
        assert.strictEqual(day2.totalHours, 24);
        assert.strictEqual(day2.intervals[0].start, '00:00');
    });

    test('14. excludeHolidays removes active hours on public holidays', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-07-13',
            endDate: '2026-07-15',
            startTime: '08:00',
            endTime: '18:00',
            selectedDays: [1, 2, 3], // Mon, Tue, Wed
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            excludeHolidays: true
        };

        const result = calculateMissionHoursWithJournal(config);
        const monday = result.days.find(d => d.date === '2026-07-13');
        const tuesdayHoliday = result.days.find(d => d.date === '2026-07-14'); // Bastille Day
        const wednesday = result.days.find(d => d.date === '2026-07-15');

        assert.strictEqual(monday.totalHours, 10);
        assert.strictEqual(tuesdayHoliday.totalHours, 0); // Excluded!
        assert.strictEqual(wednesday.totalHours, 10);
    });

    test('15. Cas B2 : Weekend H24 avec shift de jour (18:00-21:00) et lundi non sélectionné clippé à 21:00', () => {
        const config = {
            mode: 'daily',
            startDate: '2026-09-12', // Samedi
            endDate: '2026-09-14',   // Lundi dans range mais non sélectionné
            startTime: '18:00',
            endTime: '21:00',
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            selectedDays: [0, 6],    // Samedi et Dimanche seulement
            weekendH24: true,
            weekendH24StartAtMidnight: true,
            holidayH24: false
        };

        const result = calculateMissionHoursWithJournal(config);
        const saturday = result.days.find(d => d.date === '2026-09-12');
        const sunday = result.days.find(d => d.date === '2026-09-13');
        const monday = result.days.find(d => d.date === '2026-09-14');

        // Samedi (premier jour de mission) : 18:00 -> 24:00 (6h)
        assert.strictEqual(saturday.totalHours, 6);
        // Dimanche : 00:00 -> 21:00 (21h, clippé à 21:00 par la règle B2 car lundi non sélectionné)
        assert.strictEqual(sunday.totalHours, 21);
        assert.strictEqual(sunday.intervals[sunday.intervals.length - 1].end, '21:00');
        // Lundi : non sélectionné, 0h
        assert.strictEqual(monday.totalHours, 0);
        // Total global = 27h
        assert.strictEqual(result.totalHours, 27);
    });

    test('16. Cas utilisateur 27h : Weekend H24 avec début à startTime (18:00) et fin à endTime (21:00)', () => {
        const config = {
            mode: 'daily',
            startDate: '2027-01-01', // Vendredi (férié exclu)
            endDate: '2027-01-03',   // Dimanche (fin de mission)
            startTime: '18:00',
            endTime: '21:00',
            nightShiftStart: '21:00',
            nightShiftEnd: '06:00',
            selectedDays: [0, 1, 2, 3, 4, 5, 6],
            weekendH24: true,
            weekendH24StartAtMidnight: false, // Décoché : commence à 18h
            weekendH24EndAtMidnight: false,   // Décoché : termine à 21h
            holidayH24: false,
            excludeHolidays: true
        };

        const result = calculateMissionHoursWithJournal(config);
        const saturday = result.days.find(d => d.date === '2027-01-02');
        const sunday = result.days.find(d => d.date === '2027-01-03');

        // Samedi : 18:00 -> 24:00 (6h)
        assert.strictEqual(saturday.totalHours, 6);
        // Dimanche : 00:00 -> 21:00 (21h, termine à endTime=21:00 car weekendH24EndAtMidnight=false)
        assert.strictEqual(sunday.totalHours, 21);
        assert.strictEqual(sunday.intervals[sunday.intervals.length - 1].end, '21:00');
        // Total global = 27h
        assert.strictEqual(result.totalHours, 27);
    });

});

// =============================================================================
// Tests des sous-totaux mensuels — formatDailyJournalAsText
// =============================================================================

describe('formatDailyJournalAsText — Sous-totaux mensuels', () => {

    /**
     * Crée un jour simplifié pour les tests du formatter.
     * Forge directement les données sans passer par le moteur de calcul.
     */
    const makeDay = (date, hours, type = 'weekdayDay') => ({
        date,
        totalHours: hours,
        isHoliday: false,
        intervals: [{ start: '08:00', end: `${8 + hours}:00`, type }],
        buckets: {
            weekdayDay:         type === 'weekdayDay'         ? hours : 0,
            weekdayNight:       type === 'weekdayNight'       ? hours : 0,
            sundayDay:          type === 'sundayDay'          ? hours : 0,
            sundayNight:        type === 'sundayNight'        ? hours : 0,
            holidayDay:         type === 'holidayDay'         ? hours : 0,
            holidayNight:       type === 'holidayNight'       ? hours : 0,
            sundayHolidayDay:   type === 'sundayHolidayDay'   ? hours : 0,
            sundayHolidayNight: type === 'sundayHolidayNight' ? hours : 0,
        },
    });

    // MT1 — mission mono-mois : pas de sous-total injecté en mode 'auto'
    test('MT1 — mission mono-mois (Jan) : aucun sous-total en mode auto', () => {
        const days = [
            makeDay('2026-01-05', 10),
            makeDay('2026-01-12', 10),
            makeDay('2026-01-19', 10),
        ];

        const output = formatDailyJournalAsText(days, { monthlySubtotals: 'auto' });

        assert.ok(!output.includes('CUMUL'), `Ne devrait pas contenir CUMUL — reçu:\n${output}`);
        assert.ok(output.includes('05/01/2026'), `Doit contenir le 05/01 — reçu:\n${output}`);
    });

    // MT2 — mission bi-mois (Jan→Fév) : 2 sous-totaux (Jan + Fév flush final)
    test('MT2 — mission bi-mois (Jan→Fév) : sous-totaux Jan et Fév présents', () => {
        const days = [
            makeDay('2026-01-26', 10),
            makeDay('2026-01-27', 10),
            makeDay('2026-02-02', 10),
            makeDay('2026-02-03', 10),
        ];

        const output = formatDailyJournalAsText(days, { monthlySubtotals: 'auto' });

        const cumulMatches = output.match(/CUMUL/g) || [];
        assert.strictEqual(cumulMatches.length, 2, `Doit contenir 2 blocs CUMUL — reçu:\n${output}`);

        assert.ok(output.includes('CUMUL JANVIER'), `Doit contenir "CUMUL JANVIER" — reçu:\n${output}`);
        assert.ok(output.includes('CUMUL FÉVRIER'), `Doit contenir "CUMUL FÉVRIER" — reçu:\n${output}`);

        // Le cumul Janvier doit afficher 20h (2j × 10h)
        // formatHours retourne '20.0' (point décimal, pas virgule)
        const janBlock = output.split('CUMUL FÉVRIER')[0];
        assert.ok(janBlock.includes('20.0'), `Cumul Jan doit indiquer 20h — reçu:\n${janBlock}`);
    });

    // MT3 — mission quadri-mois (Jan→Avr) : 4 blocs CUMUL (un par mois)
    test('MT3 — mission quadri-mois (Jan→Avr) : 4 sous-totaux', () => {
        const days = [
            makeDay('2026-01-15', 10),
            makeDay('2026-02-15', 10),
            makeDay('2026-03-15', 10),
            makeDay('2026-04-15', 10),
        ];

        const output = formatDailyJournalAsText(days, { monthlySubtotals: 'auto' });

        const cumulMatches = output.match(/CUMUL/g) || [];
        assert.strictEqual(cumulMatches.length, 4, `Doit contenir 4 blocs CUMUL — reçu:\n${output}`);

        assert.ok(output.includes('CUMUL JANVIER'),  'Doit contenir CUMUL JANVIER');
        assert.ok(output.includes('CUMUL FÉVRIER'),  'Doit contenir CUMUL FÉVRIER');
        assert.ok(output.includes('CUMUL MARS'),     'Doit contenir CUMUL MARS');
        assert.ok(output.includes('CUMUL AVRIL'),    'Doit contenir CUMUL AVRIL');
    });

    // MT4 — monthlySubtotals: false forcé : aucun cumul même sur 4 mois
    test('MT4 — monthlySubtotals: false : aucun cumul même sur 4 mois', () => {
        const days = [
            makeDay('2026-01-15', 10),
            makeDay('2026-02-15', 10),
            makeDay('2026-03-15', 10),
            makeDay('2026-04-15', 10),
        ];

        const output = formatDailyJournalAsText(days, { monthlySubtotals: false });

        assert.ok(!output.includes('CUMUL'),
            `Ne devrait pas contenir CUMUL avec monthlySubtotals:false — reçu:\n${output}`);
    });

    // MT5 — montant € conditionnel : affiché si hourlyRate > 0, absent si 0
    test('MT5 — montant € conditionnel selon hourlyRate', () => {
        const days = [
            makeDay('2026-01-15', 10),
            makeDay('2026-02-15', 10),
        ];

        // Avec taux : doit afficher le montant
        const withRate = formatDailyJournalAsText(days, {
            monthlySubtotals: 'auto',
            hourlyRate: 25.50
        });
        assert.ok(withRate.includes('MONTANT DU MOIS'),
            `Doit afficher MONTANT DU MOIS si hourlyRate > 0 — reçu:\n${withRate}`);
        // 10h × 25.50 = 255,00 €
        assert.ok(withRate.includes('255,00'),
            `Doit afficher 255,00 — reçu:\n${withRate}`);

        // Sans taux : ne doit pas afficher le montant
        const withoutRate = formatDailyJournalAsText(days, {
            monthlySubtotals: 'auto',
            hourlyRate: 0
        });
        assert.ok(!withoutRate.includes('MONTANT DU MOIS'),
            `Ne doit pas afficher MONTANT DU MOIS si hourlyRate=0 — reçu:\n${withoutRate}`);
    });

}); // fin describe formatDailyJournalAsText



// ─────────────────────────────────────────────────────────────────────────────
// TESTS OV — Shift overnight en mode daily : comportement actuel et known limitation
//
// KNOWN LIMITATION (à corriger via toggle UX "Vacation unique / Récurrence") :
//   Quand startDate et endDate sont consécutifs (daysDiff === 1), shift overnight,
//   et les deux jours sont dans selectedDays, le moteur génère 2 vacations complètes.
//   L'utilisateur qui voulait UNE seule nuit Sam→Dim obtient 30h au lieu de 15h.
//
// La Règle C (daysDiff===1 → supprimer endDate) a été évaluée et rejetée car elle
// crée une régression sur le Test 2 (2 nuits consécutives Lun+Mar sur 2 jours).
// La distinction entre "1 nuit" et "2 nuits consécutives" nécessite une information
// explicite de l'utilisateur → toggle UX sprint suivant.
//
// OV1-OV3 : tests documentant la LIMITATION CONNUE (comportement actuel = 30h)
// OV4-OV5, OV-NR : tests verrouillant les comportements CORRECTS existants
// ─────────────────────────────────────────────────────────────────────────────
describe('OV — Shift overnight en mode daily : comportement moteur', () => {

    // Config de base réutilisable
    const overnightBase = {
        mode: 'daily',
        nightShiftStart: '21:00',
        nightShiftEnd: '06:00',
        weekendH24: false,
        holidayH24: false,
    };

    test.todo('OV1 — Sam→Dim 18:00→09:00, tous jours : 1 seul shift = 15h total [KNOWN LIMITATION — fix via toggle UX]');
    // Comportement actuel : 30h (2 × 15h). Attendu : 15h.
    // À implémenter avec le toggle "Vacation unique / Récurrence".

    test.todo('OV2 — Lun→Mar 18:00→09:00, tous jours : 1 seul shift = 15h [KNOWN LIMITATION — fix via toggle UX]');
    // Comportement actuel : 30h. Attendu : 15h.

    test.todo('OV3 — Sam→Dim 18:00→09:00, sam+dim seulement : 1 seul shift = 15h [KNOWN LIMITATION — fix via toggle UX]');
    // Comportement actuel : 30h. Attendu : 15h.

    test('OV4 — Sam→Sam (même jour) 18:00→09:00 : 1 shift complet = 15h (Règle C inactive)', () => {
        // daysDiff === 0 : startDate = endDate.
        // La Règle C ne s'applique pas → shift complet généré normalement.
        const result = calculateMissionHoursWithJournal({
            ...overnightBase,
            startDate: '2026-09-05', // Samedi = startDate = endDate
            endDate:   '2026-09-05',
            startTime: '18:00',
            endTime:   '09:00',
            selectedDays: [0, 1, 2, 3, 4, 5, 6],
        });

        // Shift complet Sam 18:00→Dim 09:00 = 15h
        assert.strictEqual(result.totalHours, 15,
            `OV4 : attendu 15h, reçu ${result.totalHours}h`);
    });

    test('OV5 — Ven→Dim 18:00→09:00, ven+dim (pas sam) : shifts indépendants = 30h', () => {
        // Sam (gap) n'est pas sélectionné → Dim n'est PAS la queue de Ven.
        // Règle C inactive (isPrevSelected=false car Sam=6 absent de [5,0]).
        // Chaque jour sélectionné génère son propre shift = 2 × 15h = 30h.
        const result = calculateMissionHoursWithJournal({
            ...overnightBase,
            startDate: '2026-09-04', // Vendredi
            endDate:   '2026-09-06', // Dimanche (daysDiff=2, Règle C inactive)
            startTime: '18:00',
            endTime:   '09:00',
            selectedDays: [5, 0], // Ven=5, Dim=0 — Sam=6 absent (trou)
        });

        // Ven : 15h, Dim : 15h (indépendants, pas de continuité overnight)
        assert.strictEqual(result.totalHours, 30,
            `OV5 : attendu 30h (shifts indépendants), reçu ${result.totalHours}h`);

        const friday = result.days.find(d => d.date === '2026-09-04');
        const sunday = result.days.find(d => d.date === '2026-09-06');
        assert.strictEqual(friday?.totalHours ?? 0, 15,
            `OV5 : Ven doit avoir 15h, reçu ${friday?.totalHours}h`);
        assert.strictEqual(sunday?.totalHours ?? 0, 15,
            `OV5 : Dim doit avoir 15h (indépendant), reçu ${sunday?.totalHours}h`);
    });

    // ── Tests de non-régression ────────────────────────────────────────────────

    test('OV-NR1 — Lun→Ven 18:00→09:00, tous jours : 5 shifts = 75h (Règle C inactive, daysDiff=4)', () => {
        // daysDiff = 4 → Règle C non déclenchée → chaque jour génère son shift.
        const result = calculateMissionHoursWithJournal({
            ...overnightBase,
            startDate: '2026-09-07', // Lundi
            endDate:   '2026-09-11', // Vendredi
            startTime: '18:00',
            endTime:   '09:00',
            selectedDays: [1, 2, 3, 4, 5], // Lun-Ven
        });

        assert.strictEqual(result.totalHours, 75,
            `OV-NR1 : attendu 75h (5 × 15h), reçu ${result.totalHours}h`);
    });

    test('OV-NR2 — Sam→Dim 18:00→09:00 avec weekendH24 : H24 a la priorité (Règle C ne doit pas interférer)', () => {
        // Même startDate/endDate consécutifs, mais avec weekendH24=true.
        // H24 écrase dayStart après Règle C → comportement H24 inchangé.
        const result = calculateMissionHoursWithJournal({
            ...overnightBase,
            startDate: '2026-09-05', // Samedi
            endDate:   '2026-09-06', // Dimanche
            startTime: '18:00',
            endTime:   '09:00',
            selectedDays: [6, 0],
            weekendH24: true,
            weekendH24StartAtMidnight: false,
        });

        // Sam H24 : 18:00→21:00 (non overnight, pas de Règle C)
        // Avec H24, le moteur force dayEnd='24:00' sur Sam et dayStart='00:00' sur Dim.
        // Le total doit refléter le comportement H24, pas la Règle C.
        assert.ok(result.totalHours > 0,
            `OV-NR2 : H24 doit produire des heures, reçu ${result.totalHours}h`);

        // Le dimanche H24 doit avoir ses heures (n'est pas supprimé par Règle C)
        const sunday = result.days.find(d => d.date === '2026-09-06');
        assert.ok((sunday?.totalHours ?? 0) > 0,
            `OV-NR2 : Dim H24 doit avoir des heures, reçu ${sunday?.totalHours}h`);
    });

    test('OV-NR3 — Sam→Dim 09:00→17:00 (jour, non overnight) : 2 shifts = 16h (Règle C inactive)', () => {
        // Shift de jour : isOvernightShift=false → Règle C non déclenchée.
        const result = calculateMissionHoursWithJournal({
            ...overnightBase,
            startDate: '2026-09-05', // Samedi
            endDate:   '2026-09-06', // Dimanche (daysDiff=1)
            startTime: '09:00',
            endTime:   '17:00',
            selectedDays: [6, 0],
        });

        // 2 shifts jour : Sam 8h + Dim 8h = 16h
        assert.strictEqual(result.totalHours, 16,
            `OV-NR3 : attendu 16h (2 shifts jour), reçu ${result.totalHours}h`);
    });

});
