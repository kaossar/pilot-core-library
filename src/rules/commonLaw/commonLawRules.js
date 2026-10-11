/**
 * commonLawRules.js — Règles de Droit Commun (Code du Travail - Régime Légal Général)
 * 
 * Utilisé lorsqu'une entreprise n'est rattachée à aucune convention spécifique ou relève du régime général.
 * Garantit les normes d'ordre public social absolu.
 * 
 * Commentaires 100 % en français.
 */

import { RULE_LEVELS, RULE_STATUS, BASE_CALCULATION_BASIS, RULE_UNITS } from '../ConventionRuleSchema.js';

export const COMMON_LAW_RULES_2026 = {
    idcc: '9999',
    label: "Droit Commun — Code du Travail (Régime Légal Général)",
    shortLabel: "Code du Travail",
    industry: "general",
    version: '2026.1',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    status: RULE_STATUS.ACTIVE,
    source: "Journal Officiel de la République Française / Code du Travail",

    // Référence légale (Ordre public)
    legalSmic: {
        hourlyRate: 12.02,
        monthlyRate: 1823.03
    },

    // Grille de référence (Smic par défaut)
    salaryGrid: {
        100: { hourlyRate: 12.02, monthlyRate: 1823.03, label: "Employé polyvalent / Salarié de base" }
    },

    // Plages horaires de nuit (Art. L.3122-1 du Code du travail)
    hoursWindows: {
        nightStart: '21:00',
        nightEnd: '06:00'
    },

    // Majorations légales
    premiums: {
        night: {
            id: 'COMM_LAW_NIGHT',
            rate: 0.00, // Le Code du travail impose un repos compensateur et/ou compensation financière par accord
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "Code du Travail - Art. L.3122-1 à L.3122-8",
            label: "Travail de nuit légal (21h-06h)",
            status: RULE_STATUS.ACTIVE
        },
        sunday: {
            id: 'COMM_LAW_SUNDAY',
            rate: 0.00, // Majoration fixée par accord ou convention de branche
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "Code du Travail - Art. L.3132-1",
            label: "Travail dominical légal",
            status: RULE_STATUS.ACTIVE
        },
        holiday: {
            id: 'COMM_LAW_HOLIDAY',
            rate: 0.00, // Chômé payé, majoration en cas de travail selon accord
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "Code du Travail - Art. L.3133-1",
            label: "Jour férié ordinaire travaillé",
            status: RULE_STATUS.ACTIVE
        },
        mayFirst: {
            id: 'COMM_LAW_MAY_FIRST',
            rate: 1.00, // +100% d'ordre public absolu
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "Code du Travail - Art. L.3133-6",
            label: "Majoration légale 1er Mai (+100%)",
            status: RULE_STATUS.ACTIVE
        }
    },

    // Primes et indemnités (aucune prime spécifique de sécurité)
    allowances: {},

    // Heures supplémentaires légales (Code du Travail Art. L.3121-28 et L.3121-36)
    overtime: {
        weeklyLegalHours: 35.0,
        tier1: {
            minHours: 35.0,
            maxHours: 43.0,
            rate: 0.25, // +25% de la 36e à la 43e heure incluse (8 premières heures sup)
            label: "Heures supplémentaires 25% (36e à 43e h)"
        },
        tier2: {
            minHours: 43.0,
            rate: 0.50, // +50% à partir de la 44e heure
            label: "Heures supplémentaires 50% (au-delà de 43h)"
        },
        annualQuota: 220 // Contingent légal annuel d'heures supplémentaires (Art. D.3121-24)
    },

    // Ancienneté légale (gérée par accord ou convention)
    seniority: null,

    // Limites de temps de travail légales (Ordre public)
    workingTimeLimits: {
        maxDailyHours: 10.0,            // Durée maximale quotidienne légale (Art. L.3121-18)
        maxWeeklyHoursAbsolute: 48.0,   // Durée maximale hebdomadaire absolue (Art. L.3121-20)
        maxWeeklyHoursAverage12w: 44.0, // Durée maximale moyenne sur 12 semaines (Art. L.3121-22)
        minDailyRestHours: 11.0,        // Repos quotidien obligatoire (Art. L.3131-1)
        minWeeklyRestHours: 35.0        // Repos hebdomadaire obligatoire 24h + 11h (Art. L.3132-2)
    }
};

export function getCommonLawRules(date = new Date()) {
    return COMMON_LAW_RULES_2026;
}
