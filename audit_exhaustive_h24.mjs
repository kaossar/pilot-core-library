/**
 * audit_exhaustive_h24.mjs — Audit approfondi et exhaustif du calculateur PILOT
 * 
 * Ce script exécute les scénarios d'audit sans AUCUNE modification du moteur 'missionCalculator.js'.
 * Pour chaque scénario :
 * Entrées → Règle métier → Calcul indépendant → Résultat moteur → Écart éventuel → Statut
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

const results = [];

function runAuditScenario({
    id,
    phase,
    family,
    scenario,
    inputs,
    ruleBusiness,
    independentCalculation,
    expectedHours,
    expectedBuckets = null,
    tolerance = 0.01
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
        results.push({
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
    const gap = Math.abs(obtainedHours - expectedHours);

    // Vérification des buckets si spécifiés
    let bucketMismatch = null;
    if (expectedBuckets) {
        for (const [key, val] of Object.entries(expectedBuckets)) {
            const actualVal = engineResult.buckets[key] || 0;
            if (Math.abs(actualVal - val) > tolerance) {
                bucketMismatch = `Bucket mismatch on ${key}: attendu ${val}h, obtenu ${actualVal}h`;
                break;
            }
        }
    }

    // Invariants de conservation physique
    const bucketSum = Object.values(engineResult.buckets).reduce((a, b) => a + b, 0);
    const daysSum = engineResult.days.reduce((a, d) => a + d.totalHours, 0);
    const invariantViolated = (Math.abs(bucketSum - obtainedHours) > 0.001) || (Math.abs(daysSum - obtainedHours) > 0.001);

    let status = '✅ Conforme';
    if (gap > tolerance || bucketMismatch || invariantViolated) {
        status = '❌ Bug confirmé';
    }

    results.push({
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
            selectedDays: config.selectedDays,
            excludeHolidays: config.excludeHolidays
        },
        ruleBusiness,
        independentCalculation,
        expectedHours,
        obtainedHours,
        obtainedBuckets: engineResult.buckets,
        gap: gap > tolerance ? `${obtainedHours - expectedHours > 0 ? '+' : ''}${(obtainedHours - expectedHours).toFixed(2)}h` : (bucketMismatch || '0h'),
        status,
        journal: formatDailyJournalAsText(engineResult.days)
    });
}

console.log("=== EXÉCUTION DE L'AUDIT EXHAUSTIF PILOT ===");

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3 — TESTS H24 OBLIGATOIRES
// ════════════════════════════════════════════════════════════════════════════

// A. H24 classique
runAuditScenario({
    id: 'H24-01',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'H24 classique : Jour 1 00:00 -> Jour 2 00:00 en mode continuous',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        startTime: '00:00',
        endTime: '00:00'
    },
    ruleBusiness: 'Une journée continue de 00:00 à 00:00 le lendemain = 24 heures physiques.',
    independentCalculation: '24h le 01/06 (00:00-24:00) + 0h le 02/06 (00:00-00:00) = 24.0h',
    expectedHours: 24.0
});

// B. H24 avec début personnalisé
runAuditScenario({
    id: 'H24-02',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'H24 début personnalisé : Lundi 08:00 -> Mardi 08:00 (continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-01', // Lundi
        endDate: '2026-06-02',   // Mardi
        startTime: '08:00',
        endTime: '08:00'
    },
    ruleBusiness: '24 heures continues glissantes réparties sur 2 jours civils.',
    independentCalculation: 'Lundi : 08:00->24:00 = 16h. Mardi : 00:00->08:00 = 8h. Total = 24.0h',
    expectedHours: 24.0,
    expectedBuckets: { weekdayDay: 13.0, weekdayNight: 11.0 }
});

runAuditScenario({
    id: 'H24-03',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'H24 début personnalisé : Lundi 18:00 -> Mardi 18:00 (continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        startTime: '18:00',
        endTime: '18:00'
    },
    ruleBusiness: '24 heures continues de 18:00 à 18:00 le lendemain.',
    independentCalculation: 'Lundi : 18:00->24:00 = 6h. Mardi : 00:00->18:00 = 18h. Total = 24.0h',
    expectedHours: 24.0
});

runAuditScenario({
    id: 'H24-04',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'H24 début personnalisé : Lundi 22:30 -> Mardi 22:30 (continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        startTime: '22:30',
        endTime: '22:30'
    },
    ruleBusiness: '24 heures continues avec fraction de 30 minutes.',
    independentCalculation: 'Lundi : 22:30->24:00 = 1.5h. Mardi : 00:00->22:30 = 22.5h. Total = 24.0h',
    expectedHours: 24.0
});

// C. H24 avec fin personnalisée
runAuditScenario({
    id: 'H24-05',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'H24 avec fin personnalisée : Samedi 08:00 -> Dimanche 08:00 (continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-06', // Samedi
        endDate: '2026-06-07',   // Dimanche
        startTime: '08:00',
        endTime: '08:00'
    },
    ruleBusiness: '24 heures continues à cheval sur samedi et dimanche.',
    independentCalculation: 'Samedi : 08:00->24:00 = 16h. Dimanche : 00:00->08:00 = 8h (dimanche). Total = 24.0h',
    expectedHours: 24.0,
    expectedBuckets: { weekdayDay: 13.0, weekdayNight: 3.0, sundayNight: 6.0, sundayDay: 2.0 }
});

runAuditScenario({
    id: 'H24-06',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'H24 avec fin personnalisée : Samedi 14:00 -> Dimanche 14:00 (continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-06',
        endDate: '2026-06-07',
        startTime: '14:00',
        endTime: '14:00'
    },
    ruleBusiness: '24h continues traversant le début du dimanche.',
    independentCalculation: 'Samedi : 14:00->24:00 = 10h. Dimanche : 00:00->14:00 = 14h. Total = 24.0h',
    expectedHours: 24.0
});

runAuditScenario({
    id: 'H24-07',
    phase: 'PHASE 3',
    family: '13. H24',
    scenario: 'H24 avec fin personnalisée : Dimanche 18:00 -> Lundi 18:00 (continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-07', // Dimanche
        endDate: '2026-06-08',   // Lundi
        startTime: '18:00',
        endTime: '18:00'
    },
    ruleBusiness: '24h continues à cheval sur dimanche soir et lundi.',
    independentCalculation: 'Dimanche : 18:00->24:00 = 6h. Lundi : 00:00->18:00 = 18h. Total = 24.0h',
    expectedHours: 24.0,
    expectedBuckets: { sundayDay: 3.0, sundayNight: 3.0, weekdayNight: 6.0, weekdayDay: 12.0 }
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4 — H24 PENDANT UN WEEK-END
// ════════════════════════════════════════════════════════════════════════════

// Cas 1 — Début avant le week-end : Vendredi 18:00 -> Dimanche 18:00
runAuditScenario({
    id: 'WE-01',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 1 : Vendredi 18:00 -> Dimanche 18:00 en mode continuous',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-05', // Vendredi
        endDate: '2026-06-07',   // Dimanche
        startTime: '18:00',
        endTime: '18:00'
    },
    ruleBusiness: 'Période continue totale de 48 heures physiques sans interruption.',
    independentCalculation: 'Ven : 18:00-24:00 = 6h. Sam : 00:00-24:00 = 24h. Dim : 00:00-18:00 = 18h. Total = 48.0h',
    expectedHours: 48.0,
    expectedBuckets: { weekdayDay: 18.0, weekdayNight: 12.0, sundayDay: 12.0, sundayNight: 6.0 }
});

// Cas 2 — Début pendant le samedi : Samedi 08:00 -> Dimanche 18:00
runAuditScenario({
    id: 'WE-02',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 2 : Samedi 08:00 -> Dimanche 18:00 en mode continuous',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-06', // Samedi
        endDate: '2026-06-07',   // Dimanche
        startTime: '08:00',
        endTime: '18:00'
    },
    ruleBusiness: 'Période continue week-end = 34 heures physiques.',
    independentCalculation: 'Samedi : 08:00-24:00 = 16h. Dimanche : 00:00-18:00 = 18h. Total = 34.0h',
    expectedHours: 34.0,
    expectedBuckets: { weekdayDay: 13.0, weekdayNight: 3.0, sundayDay: 12.0, sundayNight: 6.0 }
});

// Cas 3 — Début en milieu de week-end : Samedi 14:30 -> Dimanche 21:15
runAuditScenario({
    id: 'WE-03',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 3 : Samedi 14:30 -> Dimanche 21:15 en mode continuous (horaires exacts au quart d heure)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-06',
        endDate: '2026-06-07',
        startTime: '14:30',
        endTime: '21:15'
    },
    ruleBusiness: 'Pas d ajout artificiel de 00:00 à 14:30 ni de 21:15 à 24:00.',
    independentCalculation: 'Sam : 14:30-24:00 = 9.5h. Dim : 00:00-21:15 = 21.25h. Total = 30.75h',
    expectedHours: 30.75
});

// Cas 4 — Fin après le week-end : Dimanche 18:00 -> Lundi 06:00
runAuditScenario({
    id: 'WE-04',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 4 : Dimanche 18:00 -> Lundi 06:00 (vacation de nuit cheval WE/Semaine)',
    inputs: {
        mode: 'daily',
        startDate: '2026-06-07', // Dimanche
        endDate: '2026-06-07',   // Single sequence Sunday night
        startTime: '18:00',
        endTime: '06:00',
        selectedDays: [0]
    },
    ruleBusiness: 'Dimanche 18:00-24:00 (6h dont 3h jour dim, 3h nuit dim) + Lundi matin 00:00-06:00 (6h nuit semaine).',
    independentCalculation: 'Dimanche : 6h. Lundi matin relève : 6h. Total = 12.0h',
    expectedHours: 12.0,
    expectedBuckets: { sundayDay: 3.0, sundayNight: 3.0, weekdayNight: 6.0, weekdayDay: 0 }
});

// Cas 5 — Week-end complet avec horaires personnalisés : Vendredi 20:00 -> Lundi 08:00
runAuditScenario({
    id: 'WE-05',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 5 : Vendredi 20:00 -> Lundi 08:00 en mode continuous (couverture 60h)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-05', // Ven
        endDate: '2026-06-08',   // Lun
        startTime: '20:00',
        endTime: '08:00'
    },
    ruleBusiness: 'Continuité totale de 60 heures du vendredi soir au lundi matin.',
    independentCalculation: 'Ven : 4h (20-24h). Sam : 24h. Dim : 24h. Lun : 8h (00-08h). Total = 60.0h',
    expectedHours: 60.0
});

// Cas 6 — Week-end H24 en mode daily avec début et fin personnalisés (Demande utilisateur 27h)
runAuditScenario({
    id: 'WE-06',
    phase: 'PHASE 4',
    family: '14. Options H24 spécifiques',
    scenario: 'Cas 6 : Samedi 18:00 -> Dimanche 21:00 avec weekendH24 actif mais StartAtMidnight=false et EndAtMidnight=false',
    inputs: {
        mode: 'daily',
        startDate: '2027-01-02', // Sam
        endDate: '2027-01-03',   // Dim
        startTime: '18:00',
        endTime: '21:00',
        weekendH24: true,
        weekendH24StartAtMidnight: false,
        weekendH24EndAtMidnight: false,
        selectedDays: [0, 6]
    },
    ruleBusiness: 'Samedi commence à 18h et va jusqu à minuit (6h). Dimanche va de 00h à 21h (21h). Total = 27h.',
    independentCalculation: 'Samedi : 18:00-24:00 = 6h. Dimanche : 00:00-21:00 = 21h. Total = 27.0h',
    expectedHours: 27.0,
    expectedBuckets: { weekdayDay: 3.0, weekdayNight: 3.0, sundayDay: 15.0, sundayNight: 6.0 }
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 5 — TESTS DE PÉRIODES H24 PARTIELLES
// ════════════════════════════════════════════════════════════════════════════

runAuditScenario({
    id: 'PART-01',
    phase: 'PHASE 5',
    family: '14. Options H24 spécifiques',
    scenario: 'Période partielle : Vendredi 18:00 -> Samedi 12:00 (continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-05',
        endDate: '2026-06-06',
        startTime: '18:00',
        endTime: '12:00'
    },
    ruleBusiness: 'Heures physiques exactes : 6h le vendredi + 12h le samedi = 18.0h.',
    independentCalculation: 'Ven : 18:00-24:00 = 6h. Sam : 00:00-12:00 = 12h. Total = 18.0h',
    expectedHours: 18.0
});

runAuditScenario({
    id: 'PART-02',
    phase: 'PHASE 5',
    family: '14. Options H24 spécifiques',
    scenario: 'Période partielle : Samedi 09:00 -> Dimanche 17:00 (continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-06',
        endDate: '2026-06-07',
        startTime: '09:00',
        endTime: '17:00'
    },
    ruleBusiness: 'Heures physiques exactes : 15h le samedi + 17h le dimanche = 32.0h.',
    independentCalculation: 'Sam : 09:00-24:00 = 15h. Dim : 00:00-17:00 = 17h. Total = 32.0h',
    expectedHours: 32.0
});

runAuditScenario({
    id: 'PART-03',
    phase: 'PHASE 5',
    family: '14. Options H24 spécifiques',
    scenario: 'Période partielle : Dimanche 10:00 -> Lundi 07:00 (continuous)',
    inputs: {
        mode: 'continuous',
        startDate: '2026-06-07',
        endDate: '2026-06-08',
        startTime: '10:00',
        endTime: '07:00'
    },
    ruleBusiness: 'Heures physiques exactes : 14h le dimanche + 7h le lundi = 21.0h.',
    independentCalculation: 'Dim : 10:00-24:00 = 14h. Lun : 00:00-07:00 = 7h. Total = 21.0h',
    expectedHours: 21.0
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 6 — FRONTIÈRES PERSONNALISÉES (MINUTES CRITIQUES)
// ════════════════════════════════════════════════════════════════════════════

const boundaries = [
    { start: '20:59', end: '21:00', dur: 1/60, cat: 'weekdayDay', desc: '1 minute avant le seuil nuit 21h' },
    { start: '21:00', end: '21:01', dur: 1/60, cat: 'weekdayNight', desc: '1 minute pile à la bascule nuit 21h' },
    { start: '05:59', end: '06:00', dur: 1/60, cat: 'weekdayNight', desc: '1 minute avant la fin de nuit 06h' },
    { start: '06:00', end: '06:01', dur: 1/60, cat: 'weekdayDay', desc: '1 minute après la fin de nuit 06h' },
    { start: '23:59', end: '00:00', dur: 1/60, cat: 'weekdayNight', desc: 'Dernière minute de la journée civile' },
    { start: '00:00', end: '00:01', dur: 1/60, cat: 'weekdayNight', desc: 'Première minute de la journée civile' },
];

boundaries.forEach((b, idx) => {
    runAuditScenario({
        id: `FRT-0${idx + 1}`,
        phase: 'PHASE 6',
        family: '3. Frontières Jour / Nuit',
        scenario: `Frontière : ${b.start} -> ${b.end} (${b.desc})`,
        inputs: {
            mode: 'daily',
            startDate: '2026-06-02',
            endDate: '2026-06-02',
            startTime: b.start,
            endTime: b.end,
            selectedDays: [2]
        },
        ruleBusiness: `La tranche de 1 min doit être classée en ${b.cat} sans perte ni débordement.`,
        independentCalculation: `${(b.dur * 60).toFixed(0)} min = ${b.dur.toFixed(4)}h en ${b.cat}`,
        expectedHours: b.dur,
        expectedBuckets: { [b.cat]: b.dur }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 7 — VACATIONS SIMPLES, NUIT, DIMANCHES & FÉRIÉS
// ════════════════════════════════════════════════════════════════════════════

// Vacations simples
runAuditScenario({
    id: 'SMP-01',
    phase: 'PHASE 7',
    family: '2. Durée brute des vacations',
    scenario: 'Vacation jour standard : 08:00 -> 18:00 (10h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        startTime: '08:00',
        endTime: '18:00',
        selectedDays: [1]
    },
    ruleBusiness: '10h de jour en semaine',
    independentCalculation: '18h - 8h = 10.0h',
    expectedHours: 10.0,
    expectedBuckets: { weekdayDay: 10.0 }
});

runAuditScenario({
    id: 'SMP-02',
    phase: 'PHASE 7',
    family: '4. Traversée de minuit',
    scenario: 'Vacation traversée de minuit classique : 20:00 -> 08:00',
    inputs: {
        mode: 'daily',
        startDate: '2026-06-01', // Lundi soir
        endDate: '2026-06-01',   // Single day entry (shift déborde sur mardi matin)
        startTime: '20:00',
        endTime: '08:00',
        selectedDays: [1]
    },
    ruleBusiness: '1h jour (20-21h) + 9h nuit (21-06h) + 2h jour (06-08h) = 12h.',
    independentCalculation: 'Jour: 1h + 2h = 3h. Nuit: 9h. Total = 12.0h',
    expectedHours: 12.0,
    expectedBuckets: { weekdayDay: 3.0, weekdayNight: 9.0 }
});

// Dimanche + Jour Férié (Cumul conventionnel)
runAuditScenario({
    id: 'SUN-HOL-01',
    phase: 'PHASE 7',
    family: '8. Dimanche + Jour férié',
    scenario: 'Dimanche 1er Novembre 2026 (Toussaint) : 08:00 -> 20:00 (12h)',
    inputs: {
        mode: 'daily',
        startDate: '2026-11-01', // Dimanche ET Toussaint (férié)
        endDate: '2026-11-01',
        startTime: '08:00',
        endTime: '20:00',
        selectedDays: [0]
    },
    ruleBusiness: 'Heures physiques = 12.0h. Classification dans le bucket dédié sundayHolidayDay.',
    independentCalculation: '12 heures physiques affectées au seau sundayHolidayDay.',
    expectedHours: 12.0,
    expectedBuckets: { sundayHolidayDay: 12.0 }
});

// Férié H24 isolé avec début à minuit (Test 10 core)
runAuditScenario({
    id: 'HOL-01',
    phase: 'PHASE 7',
    family: '7. Jours fériés',
    scenario: 'Mardi 14 Juillet 2026 en holidayH24',
    inputs: {
        mode: 'daily',
        startDate: '2026-07-13',
        endDate: '2026-07-15',
        startTime: '08:00',
        endTime: '18:00',
        selectedDays: [2], // Mardi
        holidayH24: true
    },
    ruleBusiness: 'Le 14 juillet H24 doit couvrir 24 heures intégrales.',
    independentCalculation: '24h de férié (15h jour férié + 9h nuit férié). Total = 24.0h',
    expectedHours: 24.0,
    expectedBuckets: { holidayDay: 15.0, holidayNight: 9.0 }
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 8 — TESTS DE PROPRIÉTÉS (MATH INVARIANTS)
// ════════════════════════════════════════════════════════════════════════════

// Propriété 1 : Conservation du temps (Somme segments = Tout)
runAuditScenario({
    id: 'PROP-01',
    phase: 'PHASE 8',
    family: '23. Tests de propriétés',
    scenario: 'Conservation temporelle : 1 mois complet 20h-08h tous les jours avec Weekend H24',
    inputs: {
        mode: 'daily',
        startDate: '2026-03-02',
        endDate: '2026-03-30',
        startTime: '18:30',
        endTime: '07:30',
        selectedDays: [0, 1, 2, 3, 4, 5, 6],
        weekendH24: true
    },
    ruleBusiness: 'Invariance absolue : Somme(heures quotidiennes) = totalHours = Somme(buckets).',
    independentCalculation: 'Scénario historique mars 2026 = exactement 465.0 heures.',
    expectedHours: 465.0
});

// Propriété 2 : Zéro heure inventée hors bornes
runAuditScenario({
    id: 'PROP-02',
    phase: 'PHASE 8',
    family: '23. Tests de propriétés',
    scenario: 'Aucune heure inventée : Vacation mono-jour ne déborde pas au-delà du lendemain matin',
    inputs: {
        mode: 'daily',
        startDate: '2026-06-03', // Mercredi
        endDate: '2026-06-03',
        startTime: '10:00',
        endTime: '14:00',
        selectedDays: [3]
    },
    ruleBusiness: 'Strictement 4h le mercredi, zéro minute avant 10h, zéro minute après 14h, zéro heure jeudi.',
    independentCalculation: '14h - 10h = 4.0h',
    expectedHours: 4.0,
    expectedBuckets: { weekdayDay: 4.0 }
});

// Sauvegarde du rapport d'audit exhaustif
const summary = {
    total: results.length,
    passed: results.filter(r => r.status.includes('Conforme')).length,
    failed: results.filter(r => r.status.includes('Bug')).length,
    timestamp: new Date().toISOString(),
    results
};

writeFileSync('./audit_exhaustive_report.json', JSON.stringify(summary, null, 2), 'utf-8');

console.log(`\nAudit terminé : ${summary.passed}/${summary.total} scénarios conformes.`);
if (summary.failed > 0) {
    console.log(`❌ Anomalies détectées : ${summary.failed}`);
} else {
    console.log(`✅ Zéro anomalie détectée sur les scénarios testés.`);
}
