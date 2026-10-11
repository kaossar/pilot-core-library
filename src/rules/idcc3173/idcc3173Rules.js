/**
 * idcc3173Rules.js — Règles conventionnelles IDCC 3173 (Propreté et Services Associés)
 * 
 * Convention collective nationale des entreprises de propreté et services associés du 26 juillet 2011.
 * Étanche et isolée : ne contient aucune règle de la sécurité privée (pas de chien, pas de panier 1351).
 * 
 * Spécificités conventionnelles majeures :
 * - Plage de nuit : 22h00 à 05h00 (Art. 4.10) avec majoration de 20%.
 * - Travail du dimanche : majoration de 20% (Art. 4.11).
 * - Heures supplémentaires : 35h-43h (+25%), au-delà de 43h (+50%), contingent 220h.
 * - Indemnité de panier de nuit (travail continu de nuit >= 4h).
 * 
 * Commentaires 100 % en français.
 */

import { RULE_LEVELS, RULE_STATUS, BASE_CALCULATION_BASIS, RULE_UNITS } from '../ConventionRuleSchema.js';

export const IDCC_3173_RULES_2026 = {
    idcc: '3173',
    label: "Convention collective nationale des entreprises de propreté et services associés",
    shortLabel: "Propreté & Services Associés",
    industry: "cleaning",
    version: '2026.1',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    status: RULE_STATUS.ACTIVE,
    source: "Journal Officiel — Brochure 3173 / Avenants Salaires 2026",

    // Grille conventionnelle des salaires minimaux (Filière exploitation)
    salaryGrid: {
        'AS1':  { hourlyRate: 12.02, monthlyRate: 1823.03, label: "Agent de Service 1 (AS1)" },
        'AS2':  { hourlyRate: 12.25, monthlyRate: 1857.96, label: "Agent de Service 2 (AS2)" },
        'AS3':  { hourlyRate: 12.50, monthlyRate: 1895.88, label: "Agent de Service 3 (AS3)" },
        'AQS':  { hourlyRate: 12.85, monthlyRate: 1948.96, label: "Agent Qualifié de Service (AQS)" },
        'ATQS': { hourlyRate: 13.25, monthlyRate: 2009.63, label: "Agent Très Qualifié de Service (ATQS)" },
        'MP1':  { hourlyRate: 12.80, monthlyRate: 1941.38, label: "Machiniste / Conducteur Autolaveuse 1 (MP1)" },
        'MP2':  { hourlyRate: 13.10, monthlyRate: 1986.88, label: "Machiniste / Laveur de Vitres 2 (MP2)" },
        'CE1':  { hourlyRate: 13.80, monthlyRate: 2093.05, label: "Chef d'Équipe 1 (CE1)" },
        'CE2':  { hourlyRate: 14.50, monthlyRate: 2199.22, label: "Chef d'Équipe Principal 2 (CE2)" },
        'MP3':  { hourlyRate: 14.80, monthlyRate: 2244.72, label: "Laveur de Vitres Haute Hauteur / Travaux Spécifiques" },
        '120':  { hourlyRate: 12.02, monthlyRate: 1823.03, label: "Agent de Service 1 (AS1)" },
        '122':  { hourlyRate: 12.25, monthlyRate: 1857.96, label: "Agent de Service 2 (AS2)" },
        '125':  { hourlyRate: 12.50, monthlyRate: 1895.88, label: "Agent de Service 3 (AS3)" },
        '128':  { hourlyRate: 12.80, monthlyRate: 1941.38, label: "Machiniste / Conducteur Autolaveuse 1 (MP1)" },
        '131':  { hourlyRate: 13.10, monthlyRate: 1986.88, label: "Machiniste / Laveur de Vitres 2 (MP2)" },
        '138':  { hourlyRate: 13.80, monthlyRate: 2093.05, label: "Chef d'Équipe 1 (CE1)" },
        '145':  { hourlyRate: 14.50, monthlyRate: 2199.22, label: "Chef d'Équipe Principal 2 (CE2)" }
    },

    legalSmic: {
        hourlyRate: 12.02,
        monthlyRate: 1823.03
    },

    // Plages horaires de nuit (Propreté : 22h00 - 05h00, distinct de la sécurité privée 21h-06h !)
    hoursWindows: {
        nightStart: '22:00',
        nightEnd: '05:00'
    },

    // Majorations conventionnelles
    premiums: {
        night: {
            id: 'CLEAN_NIGHT_20',
            rate: 0.20, // +20% sur le salaire effectif pour les heures comprises entre 22h00 et 05h00
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "IDCC 3173 - Art. 4.10",
            label: "Majoration travail de nuit propreté (+20% de 22h à 05h)",
            status: RULE_STATUS.ACTIVE
        },
        sunday: {
            id: 'CLEAN_SUNDAY_20',
            rate: 0.20, // +20% pour travail régulier ou occasionnel du dimanche
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "IDCC 3173 - Art. 4.11",
            label: "Majoration travail dominical propreté (+20%)",
            status: RULE_STATUS.ACTIVE
        },
        holiday: {
            id: 'CLEAN_HOLIDAY_100',
            rate: 1.00, // +100% si le jour férié est travaillé
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "IDCC 3173 - Art. 4.12",
            label: "Majoration jour férié travaillé propreté (+100%)",
            status: RULE_STATUS.ACTIVE
        },
        mayFirst: {
            id: 'CLEAN_MAY_FIRST',
            rate: 1.00, // +100% légal
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "Code du Travail - Art. L.3133-6",
            label: "Majoration légale 1er Mai (+100%)",
            status: RULE_STATUS.ACTIVE
        }
    },

    // Primes et Indemnités conventionnelles Propreté
    allowances: {
        // Panier de nuit Propreté si vacation nocturne >= 4h consécutives
        nightBasket: {
            id: 'CLEAN_NIGHT_BASKET',
            amount: 3.80,
            thresholdNightHours: 4.0,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.SHIFT,
            label: "Indemnité de panier de nuit propreté (si >= 4h de nuit)",
            articleRef: "IDCC 3173 - Avenant Conditions Particulières"
        }
    },

    // Heures supplémentaires Propreté (Régime standard 35h-43h / >43h)
    overtime: {
        weeklyLegalHours: 35.0,
        tier1: {
            minHours: 35.0,
            maxHours: 43.0,
            rate: 0.25, // +25% de la 36e à la 43e h incluse
            label: "Heures supplémentaires 25% (36e à 43e h)"
        },
        tier2: {
            minHours: 43.0,
            rate: 0.50, // +50% au-delà de 43h
            label: "Heures supplémentaires 50% (au-delà de 43h)"
        },
        annualQuota: 220
    },

    // Prime d'ancienneté conventionnelle Propreté (Art. 4.8)
    seniority: {
        articleRef: "IDCC 3173 - Art. 4.8",
        label: "Prime d'expérience / ancienneté propreté",
        baseBasis: BASE_CALCULATION_BASIS.CONVENTIONAL_MIN,
        tiers: [
            { minYears: 15, rate: 0.06, label: "+6% après 15 ans" },
            { minYears: 10, rate: 0.05, label: "+5% après 10 ans" },
            { minYears: 6,  rate: 0.04, label: "+4% après 6 ans" },
            { minYears: 3,  rate: 0.02, label: "+2% après 3 ans" }
        ]
    },

    // Limites de temps de travail Propreté
    workingTimeLimits: {
        maxDailyHours: 10.0,
        maxWeeklyHoursAbsolute: 48.0,
        maxWeeklyHoursAverage12w: 44.0,
        minDailyRestHours: 11.0,
        minWeeklyRestHours: 35.0
    }
};

export function getIdcc3173Rules(date = new Date()) {
    return IDCC_3173_RULES_2026;
}
