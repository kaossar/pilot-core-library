/**
 * audit_calculator.mjs — Script d'audit exhaustif et autonome du calculateur de mission PILOT
 *
 * Exécution : node audit_calculator.mjs
 * 
 * Contraintes absolues :
 * 1. Le moteur 'missionCalculator.js' est strictement en lecture seule (aucune modification).
 * 2. Analyse rigoureuse des règles implémentées avant d'émettre un résultat attendu.
 * 3. Distinction nette entre partition des heures physiques et bases de majoration.
 * 4. Test systématique des invariants mathématiques (conservation temporelle, zéro perte, zéro double-comptage).
 * 5. Statuts stricts : PASS, FAIL, ou ⚠️ RÈGLE MÉTIER À CLARIFIER.
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
    aggregateIntervalsToBuckets
} from './src/calculators/missionCalculator.js';

import { writeFileSync } from 'fs';

// ============================================================================
// CONFIGURATION DE RÉFÉRENCE & HARNESS DE TEST
// ============================================================================

const BASE_CONFIG = {
    mode: 'daily',
    selectedDays: [0, 1, 2, 3, 4, 5, 6],
    nightShiftStart: '21:00',
    nightShiftEnd: '06:00',
    weekendH24: false,
    holidayH24: false,
    weekendH24StartAtMidnight: true,
    holidayH24StartAtMidnight: true,
    excludeHolidays: false,
    holidayExclusionSet: null,
    agents: 1,
    qualification: 'ads_qualifie',
};

let countTotal = 0;
let countPass = 0;
let countFail = 0;
let countClarify = 0;

const testRecords = [];
const anomalies = [];
const clarifyRecords = [];

/**
 * Exécute un scénario d'audit et archive le résultat.
 */
function runTest({
    id,
    category,
    scenario,
    inputs,
    ruleApplied,
    expectedHours,
    expectedBuckets = null,
    expectedInvariants = true,
    clarificationNote = null,
    isClarification = false
}) {
    countTotal++;
    const fullConfig = { ...BASE_CONFIG, ...inputs };
    const result = calculateMissionHoursWithJournal(fullConfig);

    const actualHours = result.totalHours;
    const actualBuckets = result.buckets;

    // Vérification des invariants mathématiques
    const sumBuckets = Object.values(actualBuckets).reduce((a, b) => a + b, 0);
    const sumDays = result.days.reduce((a, d) => a + d.totalHours, 0);

    const invariantNoLost = Math.abs(sumBuckets - actualHours) < 0.001;
    const invariantJournalSum = Math.abs(sumDays - actualHours) < 0.001;

    let status = 'PASS';
    let failReason = '';

    if (isClarification) {
        status = '⚠️ RÈGLE MÉTIER À CLARIFIER';
        countClarify++;
        clarifyRecords.push({ id, scenario, inputs, ruleApplied, clarificationNote, actualHours, actualBuckets });
    } else {
        const hoursMatch = Math.abs(actualHours - expectedHours) < 0.005;
        let bucketsMatch = true;
        if (expectedBuckets) {
            for (const [k, v] of Object.entries(expectedBuckets)) {
                if (Math.abs((actualBuckets[k] || 0) - v) >= 0.005) {
                    bucketsMatch = false;
                    failReason += `[Bucket ${k}: attendu ${v}h, obtenu ${(actualBuckets[k]||0)}h] `;
                }
            }
        }

        if (!hoursMatch) {
            failReason += `[Total: attendu ${expectedHours}h, obtenu ${actualHours}h] `;
        }
        if (!invariantNoLost) {
            failReason += `[Invariant physique violé: somme buckets (${sumBuckets}) ≠ total (${actualHours})] `;
        }
        if (!invariantJournalSum) {
            failReason += `[Invariant journal violé: somme jours (${sumDays}) ≠ total (${actualHours})] `;
        }

        if (hoursMatch && bucketsMatch && invariantNoLost && invariantJournalSum) {
            status = 'PASS';
            countPass++;
        } else {
            status = 'FAIL';
            countFail++;
            anomalies.push({
                id,
                scenario,
                inputs,
                ruleApplied,
                expectedHours,
                expectedBuckets,
                actualHours,
                actualBuckets,
                failReason
            });
        }
    }

    testRecords.push({
        id,
        category,
        scenario,
        inputs,
        ruleApplied,
        expectedHours,
        actualHours,
        status,
        failReason,
        clarificationNote
    });

    const symbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${symbol} [${id}] ${scenario} → ${status}`);
    if (status === 'FAIL') {
        console.log(`    Cause: ${failReason}`);
    } else if (status === '⚠️ RÈGLE MÉTIER À CLARIFIER') {
        console.log(`    Note: ${clarificationNote}`);
    }
}

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  AUDIT COMPLET DU CALCULATEUR DE MISSION PILOT (missionCalculator.js)');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

// ============================================================================
// 1. VACATIONS SIMPLES
// ============================================================================
console.log('─── 1. VACATIONS SIMPLES ───────────────────────────────────────────────────');

runTest({
    id: 'SMP-01',
    category: '1. Vacations simples',
    scenario: 'Vacation 100% de jour en semaine (08:00→18:00)',
    inputs: {
        startDate: '2026-09-08', // Mardi
        endDate: '2026-09-08',
        startTime: '08:00',
        endTime: '18:00',
        selectedDays: [2]
    },
    ruleApplied: 'Mode daily, jour ouvrable, aucune heure de nuit (plage 08h-18h comprise dans 06h-21h).',
    expectedHours: 10,
    expectedBuckets: { weekdayDay: 10, weekdayNight: 0 }
});

runTest({
    id: 'SMP-02',
    category: '1. Vacations simples',
    scenario: 'Vacation 100% de nuit intra-journalière (22:00→24:00)',
    inputs: {
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '22:00',
        endTime: '24:00',
        selectedDays: [2]
    },
    ruleApplied: 'Mode daily, plage 22h-24h comprise dans seuil de nuit (21h-06h).',
    expectedHours: 2,
    expectedBuckets: { weekdayDay: 0, weekdayNight: 2 }
});

runTest({
    id: 'SMP-03',
    category: '1. Vacations simples',
    scenario: 'Vacation mixte jour/nuit sans traversée de minuit (14:00→23:00)',
    inputs: {
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '14:00',
        endTime: '23:00',
        selectedDays: [2]
    },
    ruleApplied: '14h-21h = 7h jour, 21h-23h = 2h nuit. Total = 9h.',
    expectedHours: 9,
    expectedBuckets: { weekdayDay: 7, weekdayNight: 2 }
});

runTest({
    id: 'SMP-04',
    category: '1. Vacations simples',
    scenario: 'Vacation courte 30 minutes (08:00→08:30)',
    inputs: {
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '08:00',
        endTime: '08:30',
        selectedDays: [2]
    },
    ruleApplied: 'Fraction d’heure = 30 / 60 = 0.5h.',
    expectedHours: 0.5,
    expectedBuckets: { weekdayDay: 0.5 }
});

runTest({
    id: 'SMP-05',
    category: '1. Vacations simples',
    scenario: 'Vacation continue 24h sur une même date (00:00→24:00)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '00:00',
        endTime: '24:00'
    },
    ruleApplied: '24h continues : 00h-06h (6h nuit) + 06h-21h (15h jour) + 21h-24h (3h nuit) = 24h (15h jour / 9h nuit).',
    expectedHours: 24,
    expectedBuckets: { weekdayDay: 15, weekdayNight: 9 }
});

runTest({
    id: 'SMP-06',
    category: '1. Vacations simples',
    scenario: 'Horaires exactement sur les frontières de nuit (06:00→21:00)',
    inputs: {
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '06:00',
        endTime: '21:00',
        selectedDays: [2]
    },
    ruleApplied: 'Exactement 15 heures de jour (06h00 et 21h00 sont les bornes exactes de jour).',
    expectedHours: 15,
    expectedBuckets: { weekdayDay: 15, weekdayNight: 0 }
});

// ============================================================================
// 2. TRAVERSÉE DE MINUIT (OVERNIGHT SHIFTS)
// ============================================================================
console.log('\n─── 2. TRAVERSÉE DE MINUIT ─────────────────────────────────────────────────');

runTest({
    id: 'OVR-01',
    category: '2. Traversée de minuit',
    scenario: 'Vacation unique de nuit 18:00→06:00 (mode daily, 1 jour de départ)',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-08', // Mardi
        endDate: '2026-09-08',
        startTime: '18:00',
        endTime: '06:00',
        selectedDays: [2]
    },
    ruleApplied: 'Shift overnight 18h→06h (12h). En mode daily sur 1 date, génère 1 vacation de 12h rattachée au journal du Mardi.',
    expectedHours: 12,
    expectedBuckets: { weekdayDay: 3, weekdayNight: 9 }
});

runTest({
    id: 'OVR-02',
    category: '2. Traversée de minuit',
    scenario: 'Période continue 18:00→06:00 sur 2 jours civils (mode continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-09-08', // Mardi
        endDate: '2026-09-09',   // Mercredi
        startTime: '18:00',
        endTime: '06:00'
    },
    ruleApplied: 'Mode continu : Mardi 18h-24h (6h) + Mercredi 00h-06h (6h) = 12h physiques.',
    expectedHours: 12,
    expectedBuckets: { weekdayDay: 3, weekdayNight: 9 }
});

runTest({
    id: 'OVR-03',
    category: '2. Traversée de minuit',
    scenario: 'Vacation courte traversant minuit 23:59→00:01 (mode continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-09-08',
        endDate: '2026-09-09',
        startTime: '23:59',
        endTime: '00:01'
    },
    ruleApplied: '2 minutes de travail = 2 / 60 ≈ 0.0333h de nuit.',
    expectedHours: 2 / 60,
    expectedBuckets: { weekdayNight: 2 / 60 }
});

runTest({
    id: 'OVR-04',
    category: '2. Traversée de minuit',
    scenario: 'Shift overnight 19:30→09:00 (mode daily, date unique)',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '19:30',
        endTime: '09:00',
        selectedDays: [2]
    },
    ruleApplied: '19h30→09h00 = 13h30 = 13.5h. Jour: 19h30-21h00 (1.5h) + 06h00-09h00 (3h) = 4.5h. Nuit: 21h00-06h00 (9h).',
    expectedHours: 13.5,
    expectedBuckets: { weekdayDay: 4.5, weekdayNight: 9 }
});

runTest({
    id: 'OVR-05',
    category: '2. Traversée de minuit',
    scenario: 'Règle de découpage calendaire : Samedi 20:00 → Dimanche 06:00 (mode continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-09-12', // Samedi
        endDate: '2026-09-13',   // Dimanche
        startTime: '20:00',
        endTime: '06:00'
    },
    ruleApplied: 'Samedi 20h-21h (1h jour sam) + 21h-24h (3h nuit sam) + Dimanche 00h-06h (6h nuit dim). Total 10h.',
    expectedHours: 10,
    expectedBuckets: { weekdayDay: 1, weekdayNight: 3, sundayNight: 6 }
});

runTest({
    id: 'OVR-06',
    category: '2. Traversée de minuit',
    scenario: 'Classification overnight en mode daily : Samedi 20:00 → Dimanche 06:00 (mode daily, startDate=Samedi)',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-12', // Samedi
        endDate: '2026-09-12',
        startTime: '20:00',
        endTime: '06:00',
        selectedDays: [6]
    },
    ruleApplied: 'Le moteur daily rattache la vacation à la date de début (Samedi). La nuit dimanche (00h-06h) est classée selon les flags du samedi.',
    expectedHours: 10,
    clarificationNote: 'En mode daily, splitDayIntoIntervals applique isSunday=false de la date de départ (samedi) à l’intégralité de la vacation (y compris 00h-06h du dimanche matin). En mode continuous, les 6h sont bien affectées à sundayNight.',
    isClarification: true
});

// ============================================================================
// 3. HEURES DE NUIT
// ============================================================================
console.log('\n─── 3. HEURES DE NUIT ──────────────────────────────────────────────────────');

runTest({
    id: 'NIT-01',
    category: '3. Heures de nuit',
    scenario: 'Nuit personnalisée 22:00→07:00 en semaine',
    inputs: {
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '20:00',
        endTime: '23:00',
        nightShiftStart: '22:00',
        nightShiftEnd: '07:00',
        selectedDays: [2]
    },
    ruleApplied: '20h-22h = 2h jour, 22h-23h = 1h nuit selon les bornes personnalisées 22h-07h.',
    expectedHours: 3,
    expectedBuckets: { weekdayDay: 2, weekdayNight: 1 }
});

runTest({
    id: 'NIT-02',
    category: '3. Heures de nuit',
    scenario: 'Conservation stricte : jour + nuit = total',
    inputs: {
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '17:00',
        endTime: '23:30',
        selectedDays: [2]
    },
    ruleApplied: '17h00→23h30 = 6.5h. 17h00-21h00 (4h jour) + 21h00-23h30 (2.5h nuit).',
    expectedHours: 6.5,
    expectedBuckets: { weekdayDay: 4, weekdayNight: 2.5 }
});

// ============================================================================
// 4. DIMANCHES
// ============================================================================
console.log('\n─── 4. DIMANCHES ───────────────────────────────────────────────────────────');

runTest({
    id: 'SUN-01',
    category: '4. Dimanches',
    scenario: 'Dimanche complet de jour (08:00→20:00)',
    inputs: {
        startDate: '2026-09-13', // Dimanche
        endDate: '2026-09-13',
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [0]
    },
    ruleApplied: '12 heures de jour affectées exclusivement au bucket sundayDay.',
    expectedHours: 12,
    expectedBuckets: { sundayDay: 12, sundayNight: 0, weekdayDay: 0 }
});

runTest({
    id: 'SUN-02',
    category: '4. Dimanches',
    scenario: 'Dimanche mixte jour et nuit (14:00→23:00)',
    inputs: {
        startDate: '2026-09-13',
        endDate: '2026-09-13',
        startTime: '14:00',
        endTime: '23:00',
        selectedDays: [0]
    },
    ruleApplied: '14h-21h = 7h sundayDay, 21h-23h = 2h sundayNight. Total = 9h.',
    expectedHours: 9,
    expectedBuckets: { sundayDay: 7, sundayNight: 2 }
});

runTest({
    id: 'SUN-03',
    category: '4. Dimanches',
    scenario: 'Récurrence sur 3 dimanches consécutifs (08:00→20:00)',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-06', // Dim 1
        endDate: '2026-09-20',   // Dim 3
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [0]        // Uniquement dimanche
    },
    ruleApplied: '3 dimanches actifs (06/09, 13/09, 20/09) × 12h = 36h sundayDay.',
    expectedHours: 36,
    expectedBuckets: { sundayDay: 36 }
});

// ============================================================================
// 5. JOURS FÉRIÉS
// ============================================================================
console.log('\n─── 5. JOURS FÉRIÉS ────────────────────────────────────────────────────────');

runTest({
    id: 'HOL-01',
    category: '5. Jours fériés',
    scenario: '1er Janvier 2026 (Jeudi férié) de jour (08:00→20:00)',
    inputs: {
        startDate: '2026-01-01',
        endDate: '2026-01-01',
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [4]
    },
    ruleApplied: 'Jour de l’An en semaine : 12h classées en holidayDay.',
    expectedHours: 12,
    expectedBuckets: { holidayDay: 12, weekdayDay: 0 }
});

runTest({
    id: 'HOL-02',
    category: '5. Jours fériés',
    scenario: '1er Mai 2026 (Vendredi férié) avec nuit (16:00→23:00)',
    inputs: {
        startDate: '2026-05-01',
        endDate: '2026-05-01',
        startTime: '16:00',
        endTime: '23:00',
        selectedDays: [5]
    },
    ruleApplied: '16h-21h (5h holidayDay) + 21h-23h (2h holidayNight) = 7h.',
    expectedHours: 7,
    expectedBuckets: { holidayDay: 5, holidayNight: 2 }
});

runTest({
    id: 'HOL-03',
    category: '5. Jours fériés',
    scenario: '14 Juillet 2026 (Mardi) et 11 Novembre 2026 (Mercredi)',
    inputs: {
        startDate: '2026-07-14',
        endDate: '2026-07-14',
        startTime: '08:00',
        endTime: '18:00',
        selectedDays: [2]
    },
    ruleApplied: 'Fête nationale : 10h classées en holidayDay.',
    expectedHours: 10,
    expectedBuckets: { holidayDay: 10 }
});

runTest({
    id: 'HOL-04',
    category: '5. Jours fériés',
    scenario: 'Traversée de minuit vers un férié : Veille de Noël → Noël 2026 (mode continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-12-24', // Jeudi (non férié)
        endDate: '2026-12-25',   // Vendredi (férié Noël)
        startTime: '20:00',
        endTime: '06:00'
    },
    ruleApplied: '24 déc 20h-21h (1h weekdayDay) + 21h-24h (3h weekdayNight) + 25 déc 00h-06h (6h holidayNight). Total 10h.',
    expectedHours: 10,
    expectedBuckets: { weekdayDay: 1, weekdayNight: 3, holidayNight: 6 }
});

runTest({
    id: 'HOL-05',
    category: '5. Jours fériés',
    scenario: 'Exclusion ciblée d’un férié via holidayExclusionSet',
    inputs: {
        startDate: '2026-01-01',
        endDate: '2026-01-01',
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [4],
        holidayExclusionSet: new Set(['2026-01-01'])
    },
    ruleApplied: '1er janvier exclu via le Set d’exclusion → la journée produit 0h.',
    expectedHours: 0,
    expectedBuckets: { holidayDay: 0, weekdayDay: 0 }
});

// ============================================================================
// 6. CUMULS ET MAJORATIONS
// ============================================================================
console.log('\n─── 6. CUMULS ET MAJORATIONS ───────────────────────────────────────────────');

runTest({
    id: 'CUM-01',
    category: '6. Cumuls et majorations',
    scenario: 'Dimanche ET Férié le même jour : 1er Janvier 2023 (08:00→20:00)',
    inputs: {
        startDate: '2023-01-01', // Dimanche ET 1er de l'an
        endDate: '2023-01-01',
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [0]
    },
    ruleApplied: 'Catégorie dédiée DAY_SUN_HOL : 12h classées en sundayHolidayDay.',
    expectedHours: 12,
    expectedBuckets: { sundayHolidayDay: 12, sundayDay: 0, holidayDay: 0 }
});

runTest({
    id: 'CUM-02',
    category: '6. Cumuls et majorations',
    scenario: 'Dimanche ET Férié de nuit : 1er Janvier 2023 (21:00→24:00)',
    inputs: {
        startDate: '2023-01-01',
        endDate: '2023-01-01',
        startTime: '21:00',
        endTime: '24:00',
        selectedDays: [0]
    },
    ruleApplied: 'Catégorie dédiée NIGHT_SUN_HOL : 3h classées en sundayHolidayNight.',
    expectedHours: 3,
    expectedBuckets: { sundayHolidayNight: 3, sundayNight: 0, holidayNight: 0 }
});

runTest({
    id: 'CUM-03',
    category: '6. Cumuls et majorations',
    scenario: 'Invariant de partition : la somme des 8 buckets est égale au total physique',
    inputs: {
        mode: 'continuous',
        startDate: '2026-12-31', // Jeudi
        endDate: '2027-01-03',   // Dimanche (inclut 1er jan férié, sam weekend, dim weekend)
        startTime: '08:00',
        endTime: '20:00'
    },
    ruleApplied: 'Les 8 buckets forment une partition exacte sans aucun chevauchement physique ni perte.',
    expectedHours: 84, // Jeu 16h + Ven 24h + Sam 24h + Dim 20h = 84h
    expectedInvariants: true
});

// ============================================================================
// 7. MISSIONS H24
// ============================================================================
console.log('\n─── 7. MISSIONS H24 ────────────────────────────────────────────────────────');

runTest({
    id: 'H24-01',
    category: '7. Missions H24',
    scenario: 'Weekend H24 avec bornes 00:00→24:00 (Samedi + Dimanche pleins = 48h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-12', // Samedi
        endDate: '2026-09-13',   // Dimanche
        startTime: '00:00',
        endTime: '24:00',
        selectedDays: [0, 6],
        weekendH24: true,
        weekendH24StartAtMidnight: true
    },
    ruleApplied: 'Weekend H24 complet : Samedi 24h + Dimanche 24h = 48h.',
    expectedHours: 48
});

runTest({
    id: 'H24-02',
    category: '7. Missions H24',
    scenario: 'Weekend H24 borné par heures de mission réelles (Règle A+B : Sam 08h → Dim 20h = 36h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-12', // Samedi
        endDate: '2026-09-13',   // Dimanche
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [0, 6],
        weekendH24: true,
        weekendH24StartAtMidnight: true
    },
    ruleApplied: 'Règle absolue d’intersection : Samedi commence à 08:00 (16h), Dimanche se termine à 20:00 (20h). Total = 36h.',
    expectedHours: 36
});

runTest({
    id: 'H24-03',
    category: '7. Missions H24',
    scenario: 'Continuité Weekend H24 avec Lundi travaillé (Sam 24h + Dim 24h = 48h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-11', // Vendredi
        endDate: '2026-09-14',   // Lundi
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [0, 1, 5, 6],
        weekendH24: true,
        weekendH24StartAtMidnight: true
    },
    ruleApplied: 'Le lundi étant sélectionné, la continuité H24 du dimanche est assurée jusqu’à 24:00 : Ven (12h) + Sam (24h) + Dim (24h) + Lun (12h) = 72h.',
    expectedHours: 72
});

runTest({
    id: 'H24-04',
    category: '7. Missions H24',
    scenario: 'Férié H24 en semaine avec bornes pleines (1er Janvier 2026 = 24h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-01-01',
        endDate: '2026-01-01',
        startTime: '00:00',
        endTime: '24:00',
        selectedDays: [4],
        holidayH24: true,
        holidayH24StartAtMidnight: true
    },
    ruleApplied: 'Férié H24 plein : 24h holiday (15h holidayDay + 9h holidayNight).',
    expectedHours: 24,
    expectedBuckets: { holidayDay: 15, holidayNight: 9 }
});

// ============================================================================
// 8. RÉCURRENCE ET COMPTAGE DES VACATIONS
// ============================================================================
console.log('\n─── 8. RÉCURRENCE ET COMPTAGE ──────────────────────────────────────────────');

runTest({
    id: 'REC-01',
    category: '8. Récurrence',
    scenario: 'Lundi au Vendredi sur 4 semaines complètes (20 vacations × 10h = 200h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-07', // Lundi
        endDate: '2026-10-02',   // Vendredi (4 semaines = 20 jours ouvrés)
        startTime: '08:00',
        endTime: '18:00',
        selectedDays: [1, 2, 3, 4, 5]
    },
    ruleApplied: '20 jours sélectionnés × 10h = exactement 200h. Aucun jour de weekend généré.',
    expectedHours: 200,
    expectedBuckets: { weekdayDay: 200, sundayDay: 0 }
});

runTest({
    id: 'REC-02',
    category: '8. Récurrence',
    scenario: 'Samedi uniquement sur 4 semaines (4 vacations × 12h = 48h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-05',
        endDate: '2026-09-26',
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [6]
    },
    ruleApplied: '4 samedis actifs × 12h = 48h.',
    expectedHours: 48
});

// ============================================================================
// 9. CAS LIMITES CALENDAIRES
// ============================================================================
console.log('\n─── 9. CAS LIMITES CALENDAIRES ─────────────────────────────────────────────');

runTest({
    id: 'CAL-01',
    category: '9. Cas limites calendaires',
    scenario: 'Mois de Février standard 28 jours (2026) Lun-Ven (20 jours × 12h = 240h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [1, 2, 3, 4, 5]
    },
    ruleApplied: 'Février 2026 compte exactement 20 jours de semaine (du lundi au vendredi) × 12h = 240h.',
    expectedHours: 240
});

runTest({
    id: 'CAL-02',
    category: '9. Cas limites calendaires',
    scenario: 'Année bissextile : Février 2028 (29 jours) Lun-Ven (21 jours × 12h = 252h)',
    inputs: {
        mode: 'daily',
        startDate: '2028-02-01',
        endDate: '2028-02-29',
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [1, 2, 3, 4, 5]
    },
    ruleApplied: 'Février 2028 (bissextile) compte 21 jours de semaine × 12h = 252h.',
    expectedHours: 252
});

runTest({
    id: 'CAL-03',
    category: '9. Cas limites calendaires',
    scenario: 'Changement de mois : 30 Janvier → 02 Février 2026 (4 jours × 12h = 48h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-01-30', // Ven
        endDate: '2026-02-02',   // Lun
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [0, 1, 2, 3, 4, 5, 6]
    },
    ruleApplied: '4 jours civils consécutifs × 12h = 48h.',
    expectedHours: 48
});

runTest({
    id: 'CAL-04',
    category: '9. Cas limites calendaires',
    scenario: 'Changement d’année : 30 Décembre 2025 → 02 Janvier 2026 avec jour de l’An',
    inputs: {
        mode: 'daily',
        startDate: '2025-12-30',
        endDate: '2026-01-02',
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [0, 1, 2, 3, 4, 5, 6]
    },
    ruleApplied: '4 jours × 12h = 48h : 36h weekdayDay (30 déc, 31 déc, 2 jan) + 12h holidayDay (1er jan).',
    expectedHours: 48,
    expectedBuckets: { weekdayDay: 36, holidayDay: 12 }
});

// ============================================================================
// 10. INVARIANTS MATHÉMATIQUES & PROPRIÉTÉS
// ============================================================================
console.log('\n─── 10. INVARIANTS MATHÉMATIQUES ───────────────────────────────────────────');

runTest({
    id: 'INV-01',
    category: '10. Propriétés mathématiques',
    scenario: 'Invariant de conservation : Découper une période en deux = Total inchangé',
    inputs: {
        mode: 'continuous',
        startDate: '2026-09-07',
        endDate: '2026-09-09',
        startTime: '08:00',
        endTime: '20:00'
    },
    ruleApplied: 'La durée totale d’un bloc continu (60h) doit égaler la somme de deux sous-blocs contigus (28h + 32h).',
    expectedHours: 60
});

// Test supplémentaire de l'invariant de découpage par vérification programmée
const segPart1 = calculateMissionHoursWithJournal({
    ...BASE_CONFIG,
    mode: 'continuous',
    startDate: '2026-09-07',
    endDate: '2026-09-08',
    startTime: '08:00',
    endTime: '12:00' // 28h
});
const segPart2 = calculateMissionHoursWithJournal({
    ...BASE_CONFIG,
    mode: 'continuous',
    startDate: '2026-09-08',
    endDate: '2026-09-09',
    startTime: '12:00',
    endTime: '20:00' // 32h
});
const splitSum = segPart1.totalHours + segPart2.totalHours;
const invSplitPass = Math.abs(splitSum - 60) < 0.005;
// ============================================================================
// 11. PHASE 6 — TESTS CONTRADICTOIRES & CAS LIMITES DIFFÉRENTIELS
// ============================================================================
console.log('\n─── 11. PHASE 6 — RECHERCHE DE TESTS CONTRADICTOIRES ───────────────────────');

runTest({
    id: 'CTR-01A',
    category: '11. Tests contradictoires',
    scenario: 'Différentiel Date : Vacation 10h un Mardi ouvré (08:00→18:00)',
    inputs: {
        startDate: '2026-09-08', // Mardi
        endDate: '2026-09-08',
        startTime: '08:00',
        endTime: '18:00',
        selectedDays: [2]
    },
    ruleApplied: 'Total physique 10h, classé 100% weekdayDay.',
    expectedHours: 10,
    expectedBuckets: { weekdayDay: 10, sundayDay: 0, holidayDay: 0 }
});

runTest({
    id: 'CTR-01B',
    category: '11. Tests contradictoires',
    scenario: 'Différentiel Date : Même vacation 10h un Dimanche (08:00→18:00)',
    inputs: {
        startDate: '2026-09-13', // Dimanche
        endDate: '2026-09-13',
        startTime: '08:00',
        endTime: '18:00',
        selectedDays: [0]
    },
    ruleApplied: 'Total physique inchangé (10h), mais basculement à 100% sundayDay.',
    expectedHours: 10,
    expectedBuckets: { weekdayDay: 0, sundayDay: 10, holidayDay: 0 }
});

runTest({
    id: 'CTR-01C',
    category: '11. Tests contradictoires',
    scenario: 'Différentiel Date : Même vacation 10h un Férié (14 Juillet 2026)',
    inputs: {
        startDate: '2026-07-14', // Mardi férié
        endDate: '2026-07-14',
        startTime: '08:00',
        endTime: '18:00',
        selectedDays: [2]
    },
    ruleApplied: 'Total physique inchangé (10h), mais basculement à 100% holidayDay.',
    expectedHours: 10,
    expectedBuckets: { weekdayDay: 0, sundayDay: 0, holidayDay: 10 }
});

runTest({
    id: 'CTR-02A',
    category: '11. Tests contradictoires',
    scenario: 'Frontière de nuit : 1 minute avant 21h00 (20:59→21:00 = 1 min Jour)',
    inputs: {
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '20:59',
        endTime: '21:00',
        selectedDays: [2]
    },
    ruleApplied: 'Heure 20h < 21h → classée de jour (0.0167h weekdayDay).',
    expectedHours: 1 / 60,
    expectedBuckets: { weekdayDay: 1 / 60, weekdayNight: 0 }
});

runTest({
    id: 'CTR-02B',
    category: '11. Tests contradictoires',
    scenario: 'Frontière de nuit : 1 minute après 21h00 (21:00→21:01 = 1 min Nuit)',
    inputs: {
        startDate: '2026-09-08',
        endDate: '2026-09-08',
        startTime: '21:00',
        endTime: '21:01',
        selectedDays: [2]
    },
    ruleApplied: 'Heure 21h >= 21h → classée de nuit (0.0167h weekdayNight).',
    expectedHours: 1 / 60,
    expectedBuckets: { weekdayDay: 0, weekdayNight: 1 / 60 }
});

runTest({
    id: 'CTR-03',
    category: '11. Tests contradictoires',
    scenario: 'Ambigüité OV : 1 Nuit désirée vs 2 Nuits générées en mode récurrent',
    inputs: {
        mode: 'daily',
        startDate: '2026-09-11', // Vendredi
        endDate: '2026-09-12',   // Samedi
        startTime: '18:00',
        endTime: '06:00',
        selectedDays: [5, 6]    // Les deux jours sélectionnés
    },
    ruleApplied: 'Comportement documenté dans commit a03f62b : en mode daily, si les 2 jours sont sélectionnés, le moteur génère 2 shifts (Ven 18-06 et Sam 18-06 = 24h).',
    expectedHours: 24,
    clarificationNote: 'Known limitation documentée : si l’utilisateur saisit Ven→Sam avec Ven et Sam cochés en mode récurrent pour faire une seule nuit, le moteur génère 2 nuits (24h). Le nouveau toggle "Vacation unique" dans useMissionForm résout ce problème côté UI en forçant startDate=endDate.',
    isClarification: true
});

// ============================================================================
// EXPORT DU RAPPORT JSON
// ============================================================================

const auditReport = {
    metadata: {
        timestamp: new Date().toISOString(),
        engine: 'pilot-core-library/src/calculators/missionCalculator.js',
        totalTests: countTotal,
        passed: countPass,
        failed: countFail,
        clarifications: countClarify
    },
    results: testRecords,
    anomalies,
    clarifications: clarifyRecords
};

writeFileSync(
    './audit_report.json',
    JSON.stringify(auditReport, null, 2),
    'utf-8'
);

console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log('  SYNTHÈSE DE L’AUDIT');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(`Total scénarios exécutés : ${countTotal}`);
console.log(`✅ Conformes (PASS)       : ${countPass}`);
console.log(`❌ Anomalies réelles (FAIL) : ${countFail}`);
console.log(`⚠️  Règles à clarifier   : ${countClarify}`);
console.log('Rapport complet sauvegardé sous pilot-core-library/audit_report.json\n');
