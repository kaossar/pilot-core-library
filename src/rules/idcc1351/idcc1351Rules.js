/**
 * idcc1351Rules.js — Règles conventionnelles IDCC 1351 (Entreprises de Prévention et Sécurité)
 * 
 * Versionnée avec dates de début et fin de validité pour chaque barème.
 * Ne contient aucun 'if (date > ...)' codé en dur dans le code métier.
 * 
 * Règles d'or :
 * - Respect strict de la hiérarchie des normes (Légal > IDCC 1351 > Accords > Agence).
 * - Les majorations de nuit (+10%) et dimanche (+10%) sont calculées sur le TAUX HORAIRE MINIMUM
 *   CONVENTIONNEL du coefficient, et non sur le salaire contractuel réel s'il est supérieur.
 * - Le 1er Mai relève de l'article L.3133-6 du Code du travail (+100% impératif).
 * - Commentaires 100% en français.
 */

export const IDCC_1351_RULES_2026 = {
    idcc: '1351',
    label: "Convention collective nationale des entreprises de prévention et de sécurité",
    version: '2026.1',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',

    // Grille conventionnelle des salaires minima (base 151.67h / mois)
    salaryGrid: {
        120: { hourlyRate: 12.42, monthlyRate: 1883.85, label: "Agent de sécurité qualifié" },
        130: { hourlyRate: 12.58, monthlyRate: 1908.54, label: "Agent de sécurité confirmé" },
        140: { hourlyRate: 12.96, monthlyRate: 1965.78, label: "Chef de poste / Mobile / Cyno / SSIAP 1" },
        150: { hourlyRate: 13.45, monthlyRate: 2039.33, label: "SSIAP 2 / Agent aéroportuaire / SCT 2" },
        160: { hourlyRate: 14.19, monthlyRate: 2152.09, label: "Garde du corps / Profileur aéroportuaire" },
        170: { hourlyRate: 14.73, monthlyRate: 2234.30, label: "Chef de poste nucléaire" },
        175: { hourlyRate: 15.34, monthlyRate: 2327.04, label: "Opérateur de sûreté confirmé aéroportuaire" },
        185: { hourlyRate: 17.58, monthlyRate: 2666.29, label: "Pompier d'aérodrome chef de manœuvre" },
        190: { hourlyRate: 16.50, monthlyRate: 2502.06, label: "Coordinateur aéroportuaire" },
        200: { hourlyRate: 18.80, monthlyRate: 2851.20, label: "Chef d'équipe aéroportuaire" },
        235: { hourlyRate: 21.65, monthlyRate: 3282.88, label: "Chef de service SSIAP 3 / Chef de site nucléaire" },
        255: { hourlyRate: 23.27, monthlyRate: 3529.58, label: "Superviseur aéroportuaire" },
        300: { hourlyRate: 19.57, monthlyRate: 2968.47, label: "Responsable sécurité / conformité" },
        400: { hourlyRate: 24.77, monthlyRate: 3756.63, label: "Responsable d'agence sécurité" },
        530: { hourlyRate: 31.52, monthlyRate: 4780.86, label: "Directeur sécurité / sûreté" },
        620: { hourlyRate: 36.20, monthlyRate: 5489.93, label: "Ingénieur sécurité" }
    },

    // Référence légale (Ordre public)
    legalSmic: {
        hourlyRate: 12.02,
        monthlyRate: 1823.03
    },

    // Plages horaires
    hoursWindows: {
        nightStart: '21:00',
        nightEnd: '06:00'
    },

    // Majorations conventionnelles
    // IMPORTANT : night & sunday s'appliquent sur le minimum conventionnel (baseRateBasis: 'CONVENTIONAL_MIN')
    // holiday & mayFirst s'appliquent sur le salaire contractuel effectif (baseRateBasis: 'EFFECTIVE_SALARY')
    premiums: {
        night: {
            rate: 0.10, // +10%
            baseBasis: 'CONVENTIONAL_MIN',
            articleRef: "IDCC 1351 - Art. 7.01",
            label: "Majoration travail de nuit (21h-06h)"
        },
        sunday: {
            rate: 0.10, // +10%
            baseBasis: 'CONVENTIONAL_MIN',
            articleRef: "IDCC 1351 - Art. 7.02",
            label: "Majoration travail du dimanche"
        },
        holiday: {
            rate: 1.00, // +100%
            baseBasis: 'EFFECTIVE_SALARY',
            articleRef: "IDCC 1351 - Art. 7.03",
            label: "Majoration jour férié"
        },
        mayFirst: {
            rate: 1.00, // +100%
            baseBasis: 'EFFECTIVE_SALARY',
            articleRef: "Code du Travail - Art. L.3133-6",
            label: "Majoration légale 1er Mai"
        }
    },

    // Primes et Indemnités conventionnelles
    allowances: {
        // Prime de panier par vacation continue ou discontinue >= 6h
        basket: {
            amount: 4.48, // Net d'impôt et de cotisations selon barème URSSAF
            thresholdHours: 6.0,
            label: "Indemnité de panier",
            articleRef: "IDCC 1351 - Avenant Salaires"
        },
        // Indemnité mensuelle forfaitaire d'entretien de la tenue
        dressing: {
            monthlyAmount: 8.78, // Versée sur 11 mois par an
            label: "Indemnité d'entretien des tenues",
            articleRef: "IDCC 1351 - Accord Tenues"
        },
        // Indemnité horaire pour l'agent cynophile (prime de chien)
        dog: {
            hourlyAmount: 1.41,
            label: "Indemnité d'entretien de chien",
            articleRef: "IDCC 1351 - Annexe Cynophile"
        }
    },

    // Heures supplémentaires conventionnelles (Accord étendu du 18 mai 1993 & IDCC 1351)
    overtime: {
        weeklyLegalHours: 35.0,
        tier1: {
            minHours: 35.0,
            maxHours: 47.0,
            rate: 0.25, // +25% conventionnel jusqu'à 47h incluses (soit 12 heures supplémentaires à 25%)
            label: "Heures supplémentaires 25% (36e à 47e h)"
        },
        tier2: {
            minHours: 47.0,
            rate: 0.50, // +50% conventionnel uniquement au-delà de 47h (à partir de la 48e heure)
            label: "Heures supplémentaires 50% (au-delà de 47h)"
        },
        annualQuota: 329 // Contingent conventionnel annuel d'heures supplémentaires de branche (Accord 18 mai 1993)
    },

    // Prime d'ancienneté conventionnelle obligatoire (IDCC 1351 - Article 9.03)
    // Concerne les agents d'exploitation, employés, techniciens et agents de maîtrise (hors cadres)
    // Assise sur le salaire minimal conventionnel correspondant à la qualification du salarié
    seniority: {
        articleRef: "IDCC 1351 - Art. 9.03",
        label: "Prime d'ancienneté conventionnelle",
        baseBasis: 'CONVENTIONAL_MIN',
        tiers: [
            { minYears: 15, rate: 0.12, label: "+12% après 15 ans" },
            { minYears: 12, rate: 0.10, label: "+10% après 12 ans" },
            { minYears: 10, rate: 0.08, label: "+8% après 10 ans" },
            { minYears: 7,  rate: 0.05, label: "+5% après 7 ans" },
            { minYears: 4,  rate: 0.02, label: "+2% après 4 ans" }
        ]
    },

    // Garde-fous et conformité du temps de travail
    workingTimeLimits: {
        maxDailyHours: 12.0,            // Durée maximale quotidienne de travail
        maxWeeklyHoursAbsolute: 48.0,   // Durée maximale hebdomadaire absolue
        maxWeeklyHoursAverage12w: 44.0, // Durée maximale moyenne sur 12 semaines
        minDailyRestHours: 11.0,        // Repos quotidien légal obligatoire (Code du travail Art. L.3131-1 & IDCC 1351)
        minCycleRestHours: 12.0,        // Repos minimal entre 2 services en organisation par cycle (Accord 18 mai 1993)
        minWeeklyRestHours: 35.0        // Repos hebdomadaire obligatoire (24h + 11h)
    }
};

/**
 * Répertoire des règles conventionnelles ordonné dans le temps.
 */
const IDCC_1351_VERSIONS = [
    IDCC_1351_RULES_2026
];

/**
 * Récupère le jeu de règles conventionnelles applicable à une date donnée.
 * @param {Date|string|number} [date=new Date()]
 * @returns {typeof IDCC_1351_RULES_2026}
 */
export function getIdcc1351Rules(date = new Date()) {
    const targetDate = new Date(date);
    const dateStr = targetDate.toISOString().split('T')[0];

    const match = IDCC_1351_VERSIONS.find(v => dateStr >= v.validFrom && dateStr <= v.validTo);
    if (match) return match;

    // Si aucune version exacte ne correspond, retourner la plus récente
    return IDCC_1351_VERSIONS[IDCC_1351_VERSIONS.length - 1];
}
