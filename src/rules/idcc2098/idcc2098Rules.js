/**
 * idcc2098Rules.js — Règles conventionnelles IDCC 2098 (Accueil & Services Tertiaires)
 * 
 * Convention collective nationale du personnel des entreprises de services tertiaires du 13 août 1999 (Accueil).
 * Étanche et isolée : dédiée aux métiers d'accueil en entreprise, événementiel et conciergerie privée.
 * 
 * Commentaires 100 % en français.
 */

import { RULE_LEVELS, RULE_STATUS, BASE_CALCULATION_BASIS, RULE_UNITS } from '../ConventionRuleSchema.js';

export const IDCC_2098_RULES_2026 = {
    idcc: '2098',
    label: "Convention collective nationale du personnel des entreprises de services tertiaires (Accueil)",
    shortLabel: "Accueil & Services Tertiaires",
    industry: "reception",
    version: '2026.1',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    status: RULE_STATUS.ACTIVE,
    source: "Journal Officiel — Brochure 3301 / IDCC 2098",

    // Grille conventionnelle des salaires minimaux
    salaryGrid: {
        'N1':  { hourlyRate: 12.10, monthlyRate: 1835.21, label: "Hôte(sse) d'Accueil Débutant(e) (Niveau 1)" },
        'N2':  { hourlyRate: 12.50, monthlyRate: 1895.88, label: "Hôte(sse) d'Accueil Confirmé(e) / Événementiel (Niveau 2)" },
        'N3':  { hourlyRate: 13.50, monthlyRate: 2047.55, label: "Hôte(sse) Accueil Bilingue & Protocole VIP (Niveau 3)" },
        'CE1': { hourlyRate: 14.20, monthlyRate: 2153.71, label: "Chef d'Équipe Accueil (Niveau 4)" },
        'AM':  { hourlyRate: 15.50, monthlyRate: 2350.89, label: "Superviseur / Coordinateur Multisites (Agent de Maîtrise)" }
    },

    legalSmic: {
        hourlyRate: 12.02,
        monthlyRate: 1823.03
    },

    // Plages horaires de nuit (21h00 - 06h00)
    hoursWindows: {
        nightStart: '21:00',
        nightEnd: '06:00'
    },

    // Majorations conventionnelles
    premiums: {
        night: {
            id: 'RECEPT_NIGHT_25',
            rate: 0.25, // +25% conventionnel
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "IDCC 2098 - Art. 19 Travail de Nuit",
            label: "Majoration travail de nuit accueil (+25%)",
            status: RULE_STATUS.ACTIVE
        },
        sunday: {
            id: 'RECEPT_SUNDAY_25',
            rate: 0.25, // +25% conventionnel
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "IDCC 2098 - Art. 20 Travail dominical",
            label: "Majoration travail du dimanche accueil (+25%)",
            status: RULE_STATUS.ACTIVE
        },
        holiday: {
            id: 'RECEPT_HOLIDAY_100',
            rate: 1.00, // +100%
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "IDCC 2098 - Art. 21 Jours Fériés",
            label: "Majoration jour férié travaillé accueil (+100%)",
            status: RULE_STATUS.ACTIVE
        },
        mayFirst: {
            id: 'RECEPT_MAY_FIRST',
            rate: 1.00, // +100% légal
            baseBasis: BASE_CALCULATION_BASIS.EFFECTIVE_SALARY,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.PERCENT,
            articleRef: "Code du Travail - Art. L.3133-6",
            label: "Majoration légale 1er Mai (+100%)",
            status: RULE_STATUS.ACTIVE
        }
    },

    // Primes et Indemnités conventionnelles Accueil
    allowances: {
        uniformMaintenance: {
            id: 'RECEPT_UNIFORM_ALLOWANCE',
            monthlyAmount: 15.00,
            level: RULE_LEVELS.LEVEL_A_LEGAL_CONVENTIONAL,
            unit: RULE_UNITS.MONTH,
            label: "Indemnité forfaitaire d'entretien de la tenue d'accueil",
            articleRef: "IDCC 2098 - Annexe Tenues d'Accueil"
        }
    },

    // Heures supplémentaires Accueil (35h-43h à +25%, >43h à +50%)
    overtime: {
        weeklyLegalHours: 35.0,
        tier1: {
            minHours: 35.0,
            maxHours: 43.0,
            rate: 0.25,
            label: "Heures supplémentaires 25% (36e à 43e h)"
        },
        tier2: {
            minHours: 43.0,
            rate: 0.50,
            label: "Heures supplémentaires 50% (au-delà de 43h)"
        },
        annualQuota: 220
    },

    // Ancienneté Accueil
    seniority: {
        articleRef: "IDCC 2098 - Art. 15",
        label: "Prime d'ancienneté accueil",
        baseBasis: BASE_CALCULATION_BASIS.CONVENTIONAL_MIN,
        tiers: [
            { minYears: 12, rate: 0.08, label: "+8% après 12 ans" },
            { minYears: 8,  rate: 0.05, label: "+5% après 8 ans" },
            { minYears: 4,  rate: 0.03, label: "+3% après 4 ans" }
        ]
    },

    workingTimeLimits: {
        maxDailyHours: 10.0,
        maxWeeklyHoursAbsolute: 48.0,
        maxWeeklyHoursAverage12w: 44.0,
        minDailyRestHours: 11.0,
        minWeeklyRestHours: 35.0
    }
};

export function getIdcc2098Rules(date = new Date()) {
    return IDCC_2098_RULES_2026;
}
