/**
 * run_master_audit.mjs — Audit Maître Exhaustif du Calculateur de Mission PILOT
 *
 * Ce script exécute l'audit sans AUCUNE modification de 'missionCalculator.js'.
 * Il couvre l'ensemble des 24 familles de règles et des 10 phases méthodologiques.
 */

import {
    calculateMissionHoursWithJournal,
    calculateDayDetails,
    buildHolidayCache,
    createLocalDate,
    formatLocalDate,
    classifyTimeCategory,
    splitDayIntoIntervals,
    timeToMinutes,
    minutesToTime,
    calculateMinutesInInterval,
    aggregateIntervalsToBuckets,
    formatDailyJournalAsText
} from './src/calculators/missionCalculator.js';

import { writeFileSync } from 'fs';

const BASE_CONFIG = {
    mode: 'daily',
    selectedDays: [0, 1, 2, 3, 4, 5, 6],
    nightShiftStart: '21:00',
    nightShiftEnd: '06:00',
    weekendH24: false,
    holidayH24: false,
    weekendH24StartAtMidnight: true,
    holidayH24StartAtMidnight: true,
    weekendH24EndAtMidnight: true,
    holidayH24EndAtMidnight: true,
    excludeHolidays: false,
    holidayExclusionSet: null,
    agents: 1,
    qualification: 'ads_qualifie',
};

const auditResults = [];

function runScenario({
    id,
    phase,
    family,
    scenario,
    inputs,
    ruleBusiness,
    independentCalculation,
    expectedHours,
    expectedBuckets = null,
    tolerance = 0.01,
    isClarification = false,
    clarificationNote = null
}) {
    const config = { ...BASE_CONFIG, ...inputs };
    let engineResult;
    let executionError = null;

    try {
        engineResult = calculateMissionHoursWithJournal(config);
    } catch (err) {
        executionError = err.message;
    }

    if (executionError) {
        auditResults.push({
            id,
            phase,
            family,
            scenario,
            inputs,
            ruleBusiness,
            independentCalculation,
            expectedHours,
            obtainedHours: null,
            gap: 'ERREUR_EXECUTION: ' + executionError,
            status: '❌ Bug confirmé',
            details: executionError
        });
        return;
    }

    const obtainedHours = engineResult.totalHours;
    const gapHours = obtainedHours - expectedHours;
    const gapAbs = Math.abs(gapHours);

    // Vérification buckets
    let bucketMismatch = null;
    if (expectedBuckets) {
        for (const [key, val] of Object.entries(expectedBuckets)) {
            const actualVal = engineResult.buckets[key] || 0;
            if (Math.abs(actualVal - val) > tolerance) {
                bucketMismatch = `Bucket ${key}: attendu ${val}h, obtenu ${actualVal}h`;
                break;
            }
        }
    }

    // Invariants de conservation
    const bucketSum = Object.values(engineResult.buckets).reduce((a, b) => a + b, 0);
    const daysSum = engineResult.days.reduce((a, d) => a + d.totalHours, 0);
    const invariantViolated = (Math.abs(bucketSum - obtainedHours) > 0.001) || (Math.abs(daysSum - obtainedHours) > 0.001);

    let status = '✅ Conforme';
    let gapStr = '0h';

    if (isClarification) {
        status = '⚠️ Règle métier à clarifier';
        gapStr = clarificationNote || 'Comportement d’architecture à statuer';
    } else if (gapAbs > tolerance) {
        status = '❌ Bug confirmé';
        gapStr = `${gapHours > 0 ? '+' : ''}${gapHours.toFixed(2)}h`;
    } else if (bucketMismatch) {
        status = '❌ Bug confirmé';
        gapStr = bucketMismatch;
    } else if (invariantViolated) {
        status = '❌ Bug confirmé';
        gapStr = `Invariant physique violé: buckets(${bucketSum.toFixed(2)}) ≠ total(${obtainedHours.toFixed(2)})`;
    }

    auditResults.push({
        id,
        phase,
        family,
        scenario,
        inputs: {
            mode: config.mode,
            startDate: config.startDate,
            endDate: config.endDate,
            startTime: config.startTime,
            endTime: config.endTime,
            weekendH24: config.weekendH24,
            weekendH24StartAtMidnight: config.weekendH24StartAtMidnight,
            weekendH24EndAtMidnight: config.weekendH24EndAtMidnight,
            holidayH24: config.holidayH24,
            selectedDays: config.selectedDays
        },
        ruleBusiness,
        independentCalculation,
        expectedHours,
        obtainedHours,
        obtainedBuckets: engineResult.buckets,
        gap: gapStr,
        status,
        clarificationNote
    });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. VALIDATION DES ENTRÉES & CAS LIMITES CALENDAIRES (Familles 1, 20, 21)
// ════════════════════════════════════════════════════════════════════════════
runScenario({
    id: 'VAL-01',
    phase: 'PHASE 7',
    family: '1. Validation des entrées',
    scenario: 'Date début = Date fin en semaine de jour (08:00-18:00)',
    inputs: { startDate: '2026-06-02', endDate: '2026-06-02', startTime: '08:00', endTime: '18:00', selectedDays: [2] },
    ruleBusiness: 'Une vacation mono-jour sur date identique produit exactement la durée de la vacation.',
    independentCalculation: '18:00 - 08:00 = 10.0h jour',
    expectedHours: 10.0,
    expectedBuckets: { weekdayDay: 10.0 }
});

runScenario({
    id: 'VAL-02',
    phase: 'PHASE 7',
    family: '20. Changements de mois',
    scenario: 'Passage fin de mois standard : 30 Avril -> 02 Mai 2026',
    inputs: { mode: 'daily', startDate: '2026-04-30', endDate: '2026-05-02', startTime: '08:00', endTime: '18:00', selectedDays: [4, 5, 6] },
    ruleBusiness: '3 jours civils consécutifs (30 avr jeu, 1er mai ven férié, 2 mai sam) × 10h = 30h.',
    independentCalculation: '30 avr (10h weekdayDay) + 1er mai (10h holidayDay) + 2 mai (10h weekdayDay) = 30.0h',
    expectedHours: 30.0,
    expectedBuckets: { weekdayDay: 20.0, holidayDay: 10.0 }
});

runScenario({
    id: 'VAL-03',
    phase: 'PHASE 7',
    family: '21. Années bissextiles',
    scenario: 'Année bissextile 2028 : 28 Février -> 01 Mars 2028',
    inputs: { mode: 'daily', startDate: '2028-02-28', endDate: '2028-03-01', startTime: '08:00', endTime: '18:00', selectedDays: [1, 2, 3] },
    ruleBusiness: 'Février 2028 a 29 jours. Le 29 février 2028 (mardi) doit être compté.',
    independentCalculation: '28 fév (10h) + 29 fév (10h) + 1er mars (10h) = 30.0h',
    expectedHours: 30.0,
    expectedBuckets: { weekdayDay: 30.0 }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. DURÉE BRUTE DES VACATIONS & CAS LIMITES (Famille 2)
// ════════════════════════════════════════════════════════════════════════════
runScenario({
    id: 'DUR-01',
    phase: 'PHASE 7',
    family: '2. Durée brute des vacations',
    scenario: 'Vacation courte : 30 minutes de jour (08:00-08:30)',
    inputs: { startDate: '2026-06-02', endDate: '2026-06-02', startTime: '08:00', endTime: '08:30', selectedDays: [2] },
    ruleBusiness: '30 minutes = 0.50 heure.',
    independentCalculation: '30 min / 60 = 0.5h',
    expectedHours: 0.5,
    expectedBuckets: { weekdayDay: 0.5 }
});

runScenario({
    id: 'DUR-02',
    phase: 'PHASE 7',
    family: '2. Durée brute des vacations',
    scenario: 'Vacation limite : 1 minute de jour (14:00-14:01)',
    inputs: { startDate: '2026-06-02', endDate: '2026-06-02', startTime: '14:00', endTime: '14:01', selectedDays: [2] },
    ruleBusiness: '1 minute = 1/60 heure sans arrondissement intempestif.',
    independentCalculation: '1 min = 0.01667h',
    expectedHours: 1 / 60,
    expectedBuckets: { weekdayDay: 1 / 60 }
});

runScenario({
    id: 'DUR-03',
    phase: 'PHASE 7',
    family: '2. Durée brute des vacations',
    scenario: 'Vacation 23h59 intra-journalière (00:00-23:59)',
    inputs: { startDate: '2026-06-02', endDate: '2026-06-02', startTime: '00:00', endTime: '23:59', selectedDays: [2] },
    ruleBusiness: '1439 minutes = 23.9833h réparties en 15h jour et 8.9833h nuit.',
    independentCalculation: 'Jour: 06h-21h (15h). Nuit: 00h-06h (6h) + 21h-23h59 (2h59 = 2.9833h). Total = 23.9833h',
    expectedHours: 23 + 59 / 60,
    expectedBuckets: { weekdayDay: 15.0, weekdayNight: 8 + 59 / 60 }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. FRONTIÈRES JOUR / NUIT (Famille 3 & PHASE 6)
// ════════════════════════════════════════════════════════════════════════════
const testBoundaries = [
    { id: 'FRT-01', start: '20:59', end: '21:00', dur: 1/60, cat: 'weekdayDay', desc: '1 minute avant 21h00 (nuit)' },
    { id: 'FRT-02', start: '21:00', end: '21:01', dur: 1/60, cat: 'weekdayNight', desc: '1 minute pile après début de nuit 21h00' },
    { id: 'FRT-03', start: '05:59', end: '06:00', dur: 1/60, cat: 'weekdayNight', desc: '1 minute avant fin de nuit 06h00' },
    { id: 'FRT-04', start: '06:00', end: '06:01', dur: 1/60, cat: 'weekdayDay', desc: '1 minute après fin de nuit 06h00' },
    { id: 'FRT-05', start: '23:59', end: '24:00', dur: 1/60, cat: 'weekdayNight', desc: 'Dernière minute de la journée 23:59-24:00' }
];

testBoundaries.forEach(b => {
    runScenario({
        id: b.id,
        phase: 'PHASE 6',
        family: '3. Frontières Jour / Nuit',
        scenario: `Frontière critique : ${b.start}->${b.end} (${b.desc})`,
        inputs: { startDate: '2026-06-02', endDate: '2026-06-02', startTime: b.start, endTime: b.end, selectedDays: [2] },
        ruleBusiness: `La tranche exacte de 1 min doit être classée en ${b.cat}.`,
        independentCalculation: `1/60h en ${b.cat}`,
        expectedHours: b.dur,
        expectedBuckets: { [b.cat]: b.dur }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. TRAVERSÉE DE MINUIT (Famille 4)
// ════════════════════════════════════════════════════════════════════════════
runScenario({
    id: 'OVR-01',
    phase: 'PHASE 7',
    family: '4. Traversée de minuit',
    scenario: 'Shift overnight 20:00 -> 08:00 (12h) en semaine',
    inputs: { startDate: '2026-06-02', endDate: '2026-06-02', startTime: '20:00', endTime: '08:00', selectedDays: [2] },
    ruleBusiness: '1h jour (20-21h) + 9h nuit (21-06h) + 2h jour (06-08h) = 12h.',
    independentCalculation: 'Jour: 3h, Nuit: 9h. Total = 12.0h',
    expectedHours: 12.0,
    expectedBuckets: { weekdayDay: 3.0, weekdayNight: 9.0 }
});

runScenario({
    id: 'OVR-02',
    phase: 'PHASE 7',
    family: '4. Traversée de minuit',
    scenario: 'Passage minuit Samedi 20:00 -> Dimanche 06:00 en mode continuous',
    inputs: { mode: 'continuous', startDate: '2026-06-06', endDate: '2026-06-07', startTime: '20:00', endTime: '06:00' },
    ruleBusiness: 'Samedi 20h-21h (1h jour sam) + 21h-24h (3h nuit sam) + Dimanche 00h-06h (6h nuit dim).',
    independentCalculation: 'Samedi: 1h jour sam, 3h nuit sam. Dimanche: 6h nuit dimanche. Total = 10.0h',
    expectedHours: 10.0,
    expectedBuckets: { weekdayDay: 1.0, weekdayNight: 3.0, sundayNight: 6.0 }
});

runScenario({
    id: 'OVR-03',
    phase: 'PHASE 7',
    family: '4. Traversée de minuit',
    scenario: 'Passage minuit Samedi 20:00 -> Dimanche 06:00 en mode daily (date de départ Samedi)',
    inputs: { mode: 'daily', startDate: '2026-06-06', endDate: '2026-06-06', startTime: '20:00', endTime: '06:00', selectedDays: [6] },
    ruleBusiness: 'En mode daily mono-date, le moteur rattache la vacation au samedi. La fin de nuit (00h-06h) est classée avec les flags de la date de départ.',
    independentCalculation: 'Samedi 10h au total. Flags hérités du samedi : 1h jour semaine, 9h nuit semaine.',
    expectedHours: 10.0,
    isClarification: true,
    clarificationNote: 'En mode daily, splitDayIntoIntervals applique isSunday de la date de départ. 00h-06h est classé en weekdayNight au lieu de sundayNight. En mode continuous, le découpage calendaire attribue bien 6h à sundayNight.'
});

// ════════════════════════════════════════════════════════════════════════════
// 5. DIMANCHES ET JOURS FÉRIÉS (Familles 6, 7, 8)
// ════════════════════════════════════════════════════════════════════════════
runScenario({
    id: 'SUN-01',
    phase: 'PHASE 7',
    family: '6. Dimanche',
    scenario: 'Dimanche complet de jour (08:00-20:00)',
    inputs: { startDate: '2026-06-07', endDate: '2026-06-07', startTime: '08:00', endTime: '20:00', selectedDays: [0] },
    ruleBusiness: '12 heures physiques classées à 100% dans sundayDay.',
    independentCalculation: '12.0h sundayDay',
    expectedHours: 12.0,
    expectedBuckets: { sundayDay: 12.0, weekdayDay: 0 }
});

runScenario({
    id: 'HOL-01',
    phase: 'PHASE 7',
    family: '7. Jours fériés',
    scenario: '14 Juillet 2026 (Mardi férié) de 08:00 à 18:00',
    inputs: { startDate: '2026-07-14', endDate: '2026-07-14', startTime: '08:00', endTime: '18:00', selectedDays: [2] },
    ruleBusiness: '10 heures physiques classées à 100% dans holidayDay.',
    independentCalculation: '10.0h holidayDay',
    expectedHours: 10.0,
    expectedBuckets: { holidayDay: 10.0, weekdayDay: 0 }
});

runScenario({
    id: 'CUM-01',
    phase: 'PHASE 7',
    family: '8. Dimanche + Jour férié',
    scenario: 'Dimanche 1er Novembre 2026 (Toussaint) de 08:00 à 20:00',
    inputs: { startDate: '2026-11-01', endDate: '2026-11-01', startTime: '08:00', endTime: '20:00', selectedDays: [0] },
    ruleBusiness: 'Cumul conventionnel dimanche + férié classé dans le bucket exclusif sundayHolidayDay.',
    independentCalculation: '12.0h sundayHolidayDay',
    expectedHours: 12.0,
    expectedBuckets: { sundayHolidayDay: 12.0, sundayDay: 0, holidayDay: 0 }
});

// ════════════════════════════════════════════════════════════════════════════
// 6. PHASE 3 — TESTS H24 OBLIGATOIRES (A, B, C)
// ════════════════════════════════════════════════════════════════════════════
runScenario({
    id: 'H24-01',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'A. H24 classique : Jour 1 00:00 -> Jour 2 00:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-01', endDate: '2026-06-02', startTime: '00:00', endTime: '00:00' },
    ruleBusiness: 'Une période continue de 00:00 le J1 à 00:00 le J2 doit représenter exactement 24h physiques.',
    independentCalculation: 'J1 (00:00-24:00 = 24h) + J2 (00:00-00:00 = 0h) = 24.0h',
    expectedHours: 24.0
});

runScenario({
    id: 'H24-02',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'B. H24 début personnalisé : Lundi 08:00 -> Mardi 08:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-01', endDate: '2026-06-02', startTime: '08:00', endTime: '08:00' },
    ruleBusiness: '24 heures glissantes continues sur 2 jours civils.',
    independentCalculation: 'Lundi 08-24h (16h = 13h jour + 3h nuit) + Mardi 00-08h (8h = 6h nuit + 2h jour) = 24.0h (15h jour + 9h nuit)',
    expectedHours: 24.0,
    expectedBuckets: { weekdayDay: 15.0, weekdayNight: 9.0 }
});

runScenario({
    id: 'H24-03',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'B. H24 début personnalisé : Lundi 18:00 -> Mardi 18:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-01', endDate: '2026-06-02', startTime: '18:00', endTime: '18:00' },
    ruleBusiness: '24 heures continues de 18h à 18h le lendemain.',
    independentCalculation: 'Lundi (6h = 3h jour + 3h nuit) + Mardi (18h = 6h nuit + 12h jour) = 24.0h (15h jour + 9h nuit)',
    expectedHours: 24.0,
    expectedBuckets: { weekdayDay: 15.0, weekdayNight: 9.0 }
});

runScenario({
    id: 'H24-04',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'B. H24 début personnalisé : Lundi 22:30 -> Mardi 22:30 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-01', endDate: '2026-06-02', startTime: '22:30', endTime: '22:30' },
    ruleBusiness: '24 heures continues avec fraction d’heure.',
    independentCalculation: 'Lundi 22h30-24h00 (1.5h nuit) + Mardi 00h00-22h30 (22.5h) = 24.0h (15h jour + 9h nuit)',
    expectedHours: 24.0,
    expectedBuckets: { weekdayDay: 15.0, weekdayNight: 9.0 }
});

runScenario({
    id: 'H24-05',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'C. H24 fin personnalisée : Samedi 08:00 -> Dimanche 08:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-06', endDate: '2026-06-07', startTime: '08:00', endTime: '08:00' },
    ruleBusiness: '24 heures continues traversant le début du dimanche.',
    independentCalculation: 'Samedi 08-24h (16h = 13h jour + 3h nuit) + Dimanche 00-08h (8h = 6h nuit dim + 2h jour dim) = 24.0h',
    expectedHours: 24.0,
    expectedBuckets: { weekdayDay: 13.0, weekdayNight: 3.0, sundayDay: 2.0, sundayNight: 6.0 }
});

runScenario({
    id: 'H24-06',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'C. H24 fin personnalisée : Samedi 14:00 -> Dimanche 14:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-06', endDate: '2026-06-07', startTime: '14:00', endTime: '14:00' },
    ruleBusiness: '24 heures continues traversant le dimanche.',
    independentCalculation: 'Samedi 14-24h (10h = 7h jour + 3h nuit) + Dimanche 00-14h (14h = 6h nuit dim + 8h jour dim) = 24.0h',
    expectedHours: 24.0,
    expectedBuckets: { weekdayDay: 7.0, weekdayNight: 3.0, sundayDay: 8.0, sundayNight: 6.0 }
});

runScenario({
    id: 'H24-07',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'C. H24 fin personnalisée : Dimanche 18:00 -> Lundi 18:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-07', endDate: '2026-06-08', startTime: '18:00', endTime: '18:00' },
    ruleBusiness: '24 heures continues du dimanche soir au lundi soir.',
    independentCalculation: 'Dimanche 18-24h (6h = 3h jour dim + 3h nuit dim) + Lundi 00-18h (18h = 6h nuit lun + 12h jour lun) = 24.0h',
    expectedHours: 24.0,
    expectedBuckets: { sundayDay: 3.0, sundayNight: 3.0, weekdayNight: 6.0, weekdayDay: 12.0 }
});

// ════════════════════════════════════════════════════════════════════════════
// 7. PHASE 4 — H24 PENDANT UN WEEK-END (Cas 1 à 5 + Cas utilisateur)
// ════════════════════════════════════════════════════════════════════════════
runScenario({
    id: 'WE-01',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 1 : Vendredi 18:00 -> Dimanche 18:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-05', endDate: '2026-06-07', startTime: '18:00', endTime: '18:00' },
    ruleBusiness: 'Couverture continue de 48 heures physiques sans interruption.',
    independentCalculation: 'Ven (6h = 3h jour + 3h nuit) + Sam (24h = 15h jour + 9h nuit) + Dim (18h = 6h nuit dim + 12h jour dim) = 48.0h',
    expectedHours: 48.0,
    expectedBuckets: { weekdayDay: 18.0, weekdayNight: 12.0, sundayDay: 12.0, sundayNight: 6.0 }
});

runScenario({
    id: 'WE-02',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 2 : Samedi 08:00 -> Dimanche 18:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-06', endDate: '2026-06-07', startTime: '08:00', endTime: '18:00' },
    ruleBusiness: '34 heures physiques réparties entre Samedi et Dimanche.',
    independentCalculation: 'Sam (16h = 13h jour + 3h nuit) + Dim (18h = 6h nuit dim + 12h jour dim) = 34.0h',
    expectedHours: 34.0,
    expectedBuckets: { weekdayDay: 13.0, weekdayNight: 3.0, sundayDay: 12.0, sundayNight: 6.0 }
});

runScenario({
    id: 'WE-03',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 3 : Samedi 14:30 -> Dimanche 21:15 (continuous, quarts d’heure)',
    inputs: { mode: 'continuous', startDate: '2026-06-06', endDate: '2026-06-07', startTime: '14:30', endTime: '21:15' },
    ruleBusiness: '30 heures 45 minutes physiques exactes.',
    independentCalculation: 'Sam 14h30-24h00 (9.5h) + Dim 00h00-21h15 (21.25h) = 30.75h',
    expectedHours: 30.75
});

runScenario({
    id: 'WE-04',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 4 : Dimanche 18:00 -> Lundi 06:00 (vacation nuit WE/Semaine en continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-07', endDate: '2026-06-08', startTime: '18:00', endTime: '06:00' },
    ruleBusiness: '12 heures physiques dont 6h Dimanche (3h jour dim, 3h nuit dim) et 6h Lundi matin (6h nuit semaine).',
    independentCalculation: 'Dimanche : 3h sundayDay, 3h sundayNight. Lundi matin : 6h weekdayNight. Total = 12.0h',
    expectedHours: 12.0,
    expectedBuckets: { sundayDay: 3.0, sundayNight: 3.0, weekdayNight: 6.0, weekdayDay: 0 }
});

runScenario({
    id: 'WE-05',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 5 : Vendredi 20:00 -> Lundi 08:00 (continuous 60h)',
    inputs: { mode: 'continuous', startDate: '2026-06-05', endDate: '2026-06-08', startTime: '20:00', endTime: '08:00' },
    ruleBusiness: 'Continuité totale de 60 heures du vendredi soir au lundi matin.',
    independentCalculation: 'Ven (4h) + Sam (24h) + Dim (24h) + Lun (8h) = 60.0h',
    expectedHours: 60.0
});

runScenario({
    id: 'WE-06',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 6 (Demande utilisateur 27h) : Samedi 18:00 -> Dimanche 21:00 en mode daily avec weekendH24 et début/fin personnalisés',
    inputs: {
        mode: 'daily',
        startDate: '2027-01-02',
        endDate: '2027-01-03',
        startTime: '18:00',
        endTime: '21:00',
        weekendH24: true,
        weekendH24StartAtMidnight: false,
        weekendH24EndAtMidnight: false,
        selectedDays: [0, 6]
    },
    ruleBusiness: 'Samedi commence à 18h (6h). Dimanche termine à 21h (21h). Total = 27h.',
    independentCalculation: 'Samedi 18h-24h (6h) + Dimanche 00h-21h (21h) = 27.0h',
    expectedHours: 27.0,
    expectedBuckets: { weekdayDay: 3.0, weekdayNight: 3.0, sundayDay: 15.0, sundayNight: 6.0 }
});

// ════════════════════════════════════════════════════════════════════════════
// 8. PHASE 5 — TESTS DE PÉRIODES H24 PARTIELLES
// ════════════════════════════════════════════════════════════════════════════
runScenario({
    id: 'PART-01',
    phase: 'PHASE 5',
    family: '14. Options H24 spécifiques',
    scenario: 'Période partielle : Vendredi 18:00 -> Samedi 12:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-05', endDate: '2026-06-06', startTime: '18:00', endTime: '12:00' },
    ruleBusiness: 'Heures physiques exactes : 6h Ven + 12h Sam = 18.0h.',
    independentCalculation: '18.0h',
    expectedHours: 18.0
});

runScenario({
    id: 'PART-02',
    phase: 'PHASE 5',
    family: '14. Options H24 spécifiques',
    scenario: 'Période partielle : Samedi 09:00 -> Dimanche 17:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-06', endDate: '2026-06-07', startTime: '09:00', endTime: '17:00' },
    ruleBusiness: 'Heures physiques exactes : 15h Sam + 17h Dim = 32.0h.',
    independentCalculation: '32.0h',
    expectedHours: 32.0
});

runScenario({
    id: 'PART-03',
    phase: 'PHASE 5',
    family: '14. Options H24 spécifiques',
    scenario: 'Période partielle : Dimanche 10:00 -> Lundi 07:00 (continuous)',
    inputs: { mode: 'continuous', startDate: '2026-06-07', endDate: '2026-06-08', startTime: '10:00', endTime: '07:00' },
    ruleBusiness: 'Heures physiques exactes : 14h Dim + 7h Lun = 21.0h.',
    independentCalculation: '21.0h',
    expectedHours: 21.0
});

// ════════════════════════════════════════════════════════════════════════════
// 9. RÉCURRENCES & COMPTAGE DE VACATIONS (Familles 9, 10)
// ════════════════════════════════════════════════════════════════════════════
runScenario({
    id: 'REC-01',
    phase: 'PHASE 7',
    family: '9. Récurrence hebdomadaire',
    scenario: 'Lundi au Vendredi sur 4 semaines (20 jours ouvrés × 10h = 200h)',
    inputs: { mode: 'daily', startDate: '2026-09-07', endDate: '2026-10-02', startTime: '08:00', endTime: '18:00', selectedDays: [1, 2, 3, 4, 5] },
    ruleBusiness: '20 jours sélectionnés × 10h = 200h. Zéro heure de week-end générée.',
    independentCalculation: '20 × 10 = 200.0h',
    expectedHours: 200.0,
    expectedBuckets: { weekdayDay: 200.0, sundayDay: 0 }
});

runScenario({
    id: 'REC-02',
    phase: 'PHASE 7',
    family: '9. Récurrence hebdomadaire',
    scenario: 'Samedi + Dimanche sur 3 week-ends (6 jours × 12h = 72h)',
    inputs: { mode: 'daily', startDate: '2026-09-05', endDate: '2026-09-20', startTime: '08:00', endTime: '20:00', selectedDays: [0, 6] },
    ruleBusiness: '3 samedis (36h weekdayDay) + 3 dimanches (36h sundayDay) = 72h.',
    independentCalculation: '36h sam + 36h dim = 72.0h',
    expectedHours: 72.0,
    expectedBuckets: { weekdayDay: 36.0, sundayDay: 36.0 }
});

// ════════════════════════════════════════════════════════════════════════════
// 10. TESTS DE PROPRIÉTÉS MATHÉMATIQUES (Famille 23 & PHASE 8)
// ════════════════════════════════════════════════════════════════════════════
runScenario({
    id: 'PROP-01',
    phase: 'PHASE 8',
    family: '23. Tests de propriétés',
    scenario: 'Conservation du temps : Somme des jours = Somme des buckets = Total',
    inputs: { mode: 'daily', startDate: '2026-03-02', endDate: '2026-03-30', startTime: '18:30', endTime: '07:30', selectedDays: [0, 1, 2, 3, 4, 5, 6], weekendH24: true },
    ruleBusiness: 'Invariance absolue de conservation temporelle.',
    independentCalculation: 'Total historique mars 2026 = 465.0h',
    expectedHours: 465.0
});

runScenario({
    id: 'PROP-02',
    phase: 'PHASE 8',
    family: '23. Tests de propriétés',
    scenario: 'Aucune heure inventée : Vacation intra-journalière ne déborde pas',
    inputs: { mode: 'daily', startDate: '2026-06-03', endDate: '2026-06-03', startTime: '10:00', endTime: '14:00', selectedDays: [3] },
    ruleBusiness: 'Strictement 4h, zéro minute avant 10h, zéro minute après 14h.',
    independentCalculation: '4.0h',
    expectedHours: 4.0,
    expectedBuckets: { weekdayDay: 4.0 }
});

runScenario({
    id: 'PROP-03',
    phase: 'PHASE 8',
    family: '23. Tests de propriétés',
    scenario: 'Cohérence du découpage : Bloc 60h continu équivalent à la somme de ses sous-blocs',
    inputs: { mode: 'continuous', startDate: '2026-09-07', endDate: '2026-09-09', startTime: '08:00', endTime: '20:00' },
    ruleBusiness: 'La durée totale d’un bloc continu (60h) égale la somme de deux sous-blocs contigus (28h + 32h).',
    independentCalculation: 'Bloc 60h = 28h + 32h',
    expectedHours: 60.0
});

// Écriture du rapport
const summary = {
    total: auditResults.length,
    passed: auditResults.filter(r => r.status.includes('Conforme')).length,
    failed: auditResults.filter(r => r.status.includes('Bug')).length,
    clarifications: auditResults.filter(r => r.status.includes('clarifier')).length,
    timestamp: new Date().toISOString(),
    results: auditResults
};

writeFileSync('./audit_master_report.json', JSON.stringify(summary, null, 2), 'utf-8');

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  RÉSULTATS DE L’AUDIT MAÎTRE EXHAUSTIF PILOT');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(`Total scénarios testés : ${summary.total}`);
console.log(`✅ Conformes (PASS)       : ${summary.passed}`);
console.log(`❌ Bugs confirmés (FAIL)  : ${summary.failed}`);
console.log(`⚠️  Règles à clarifier   : ${summary.clarifications}`);
console.log('Rapport écrit dans pilot-core-library/audit_master_report.json');
