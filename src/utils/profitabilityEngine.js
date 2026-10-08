/**
 * profitabilityEngine.js — Moteur de Rentabilité PILOT
 *
 * Calcule le coût réel, le revenu et la marge d'une mission
 * à partir des HourBuckets produits par calculateMissionHoursWithJournal().
 *
 * Principes :
 * - Purement fonctionnel (aucun état partagé)
 * - Aucune modification des fonctions calculateur existantes
 * - Alertes uniquement — jamais bloquant
 * - Compatible tarif normal et tarif lissé
 */

import { IDCC_1351_DATA } from '../constants/idcc1351.js';

// ============================================================================
// CONSTANTES INTERNES
// ============================================================================

/**
 * Coefficients de majoration du coût agent (IDCC 1351 payRules)
 * Mappés sur les clés de HourBuckets du calculateur
 */
const IDCC_COST_COEFFS = {
    weekdayDay:         1.00,   // Heure jour semaine — taux de base
    weekdayNight:       IDCC_1351_DATA.payRules.nightCoeff,              // ×1.10
    sundayDay:          IDCC_1351_DATA.payRules.sundayCoeff,              // ×1.10
    sundayNight:        IDCC_1351_DATA.payRules.sundayNightCoeff,         // ×1.20
    holidayDay:         IDCC_1351_DATA.payRules.holidayCoeff,             // ×2.00
    holidayNight:       IDCC_1351_DATA.payRules.holidayNightCoeff,        // ×2.10
    sundayHolidayDay:   IDCC_1351_DATA.payRules.sundayHolidayCoeff,       // ×2.10
    sundayHolidayNight: IDCC_1351_DATA.payRules.sundayHolidayNightCoeff,  // ×2.30 — cumul max
};

/**
 * Labels lisibles pour l'affichage frontend (clés → libellés)
 */
export const BUCKET_LABELS = {
    weekdayDay:         'Jour (semaine)',
    weekdayNight:       'Nuit (semaine)',
    sundayDay:          'Dimanche (jour)',
    sundayNight:        'Dimanche (nuit)',
    holidayDay:         'Férié (jour)',
    holidayNight:       'Férié (nuit)',
    sundayHolidayDay:   'Dim. + Férié (jour)',
    sundayHolidayNight: 'Dim. + Férié (nuit)',
};

/** Ordre d'affichage des buckets */
export const BUCKET_ORDER = [
    'weekdayDay', 'weekdayNight',
    'sundayDay', 'sundayNight',
    'holidayDay', 'holidayNight',
    'sundayHolidayDay', 'sundayHolidayNight',
];

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Récupère le taux horaire brut IDCC d'une qualification
 * @param {string} qualificationId - ex: 'ads_qualifie'
 * @returns {number} Taux IDCC en €/h, ou 0 si non trouvé
 */
export function getIdccWage(qualificationId) {
    const profession = IDCC_1351_DATA.professions.find(p => p.id === qualificationId);
    return profession?.rate ?? 0;
}

/**
 * Calcule le coût réel horaire de l'agent pour un bucket donné
 * Formule : wage × idccCoeff × (1 + chargesPatronales) + fraisStructure
 *
 * @param {number} wage - Taux IDCC brut de base (€/h)
 * @param {string} bucket - Clé du bucket (ex: 'weekdayNight')
 * @param {object} financialConfig - { chargesPatronales, fraisStructure }
 * @returns {number} Coût réel en €/h pour ce type d'heure
 */
export function calcCostPerBucket(wage, bucket, financialConfig) {
    const { chargesPatronales = 0.46, fraisStructure = 1.50 } = financialConfig;
    const idccCoeff = IDCC_COST_COEFFS[bucket] ?? 1.00;
    return (wage * idccCoeff * (1 + chargesPatronales)) + fraisStructure;
}

/**
 * Calcule le tarif de facturation pour un bucket donné
 *
 * Mode normal (non lissé) : billingRate × coeffFacturation[bucket]
 * Mode lissé              : billingRate uniforme pour tous les buckets
 *
 * @param {number} billingRate - Taux de base saisi par l'utilisateur (€/h)
 * @param {string} bucket - Clé du bucket
 * @param {object} pricing - { isLissee, coeffs }
 * @returns {number} Revenu facturé en €/h pour ce type d'heure
 */
export function calcRevenuePerBucket(billingRate, bucket, pricing) {
    if (pricing.isLissee) {
        // Tarif lissé : même taux pour tous les types d'heures...
        // SAUF les jours fériés qui sont structurellement et légalement facturés double (x2)
        const isHolidayBucket = ['holidayDay', 'holidayNight', 'sundayHolidayDay', 'sundayHolidayNight'].includes(bucket);
        if (isHolidayBucket) {
            // Un jour férié lissé est toujours double (2.00) ou tarif imposé par convention
            const holidayMultiplier = pricing.holidaySurcharge ?? 2.0;
            return billingRate * holidayMultiplier;
        }
        return billingRate;
    }

    // Mapping HourBuckets → coefficients de facturation du calculateur (Mode Détaillé)
    const BUCKET_TO_PRICING_COEFF = {
        weekdayDay:         1.00,
        weekdayNight:       pricing.coeffs?.night         ?? 1.00,
        sundayDay:          pricing.coeffs?.sunday        ?? 1.00,
        sundayNight:        pricing.coeffs?.sundayNight   ?? 1.00,
        holidayDay:         pricing.coeffs?.holiday       ?? 2.00,
        holidayNight:       pricing.coeffs?.holidayNight  ?? 2.00,
        sundayHolidayDay:   pricing.coeffs?.sundayHoliday ?? 2.00,
        sundayHolidayNight: pricing.coeffs?.sundayHolidayNight ?? 2.00,
    };

    return billingRate * (BUCKET_TO_PRICING_COEFF[bucket] ?? 1.00);
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

/**
 * Calcule la rentabilité complète d'une mission par type d'heure.
 *
 * @param {object} buckets - HourBuckets depuis calculateMissionHoursWithJournal()
 * @param {object} pricing - pricingConfig du calculateur
 *   { hourlyRate, isLissee, coeffs: { night, sunday, sundayNight, holiday, holidayNight, sundayHoliday, sundayHolidayNight } }
 * @param {object} financialConfig - Config financière agence
 *   { chargesPatronales, fraisStructure, minMarginRate, urgency: { enabled, windowHours, surchargeRate } }
 * @param {string} qualificationId - ID de qualification IDCC (ex: 'ads_qualifie')
 * @param {number} agents - Nombre d'agents
 * @param {string} [missionStartDate] - Date de début mission (YYYY-MM-DD) pour détection urgence
 * @returns {ProfitabilityResult|null} null si données insuffisantes (taux = 0)
 */
export function calcProfitability(buckets, pricing, financialConfig, qualificationId, agents = 1, missionStartDate = null) {
    const billingRate = pricing?.hourlyRate ?? 0;
    const wage = getIdccWage(qualificationId);

    // Données insuffisantes : retourner null plutôt que des valeurs trompeuses
    if (billingRate <= 0 || wage <= 0) return null;

    const fc = {
        chargesPatronales: financialConfig?.chargesPatronales ?? 0.46,
        fraisStructure:    financialConfig?.fraisStructure    ?? 1.50,
        minMarginRate:     financialConfig?.minMarginRate     ?? 0.15,
    };

    // --- Calcul par bucket ---
    const breakdown = {};
    let totalCost    = 0;
    let totalRevenue = 0;
    let totalHours   = 0;

    for (const bucket of BUCKET_ORDER) {
        const hours         = (buckets?.[bucket] ?? 0) * agents;
        const costPerH      = calcCostPerBucket(wage, bucket, fc);
        const revenuePerH   = calcRevenuePerBucket(billingRate, bucket, pricing);
        const cost          = hours * costPerH;
        const revenue       = hours * revenuePerH;
        const marginAbs     = revenue - cost;
        const marginPct     = revenuePerH > 0 ? marginAbs / revenuePerH : 0;

        breakdown[bucket] = {
            hours,
            costPerH:    Math.round(costPerH    * 100) / 100,
            revenuePerH: Math.round(revenuePerH * 100) / 100,
            cost:        Math.round(cost        * 100) / 100,
            revenue:     Math.round(revenue     * 100) / 100,
            marginAbs:   Math.round(marginAbs   * 100) / 100,
            marginPct:   Math.round(marginPct   * 10000) / 100, // % arrondi 2 décimales
            isPositive:  marginAbs >= 0,
        };

        totalCost    += cost;
        totalRevenue += revenue;
        totalHours   += hours;
    }

    const grossMargin   = totalRevenue - totalCost;
    const marginPct     = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;
    const isAboveMin    = marginPct >= (fc.minMarginRate * 100);

    // --- Taux recommandé pour atteindre la marge minimale ---
    // Pour le tarif lissé, on cherche un taux X tel que (X - coutMoyen)/X >= minMarginRate
    // → X = coutMoyen / (1 - minMarginRate)
    const avgCostPerH       = totalHours > 0 ? totalCost / totalHours : 0;
    const minRecommendedRate = avgCostPerH > 0
        ? Math.ceil((avgCostPerH / (1 - fc.minMarginRate)) * 100) / 100
        : 0;

    // --- Détection d'urgence ---
    const urgencyConfig = financialConfig?.urgency ?? {};
    const urgency = detectUrgency(missionStartDate, urgencyConfig);

    // Taux suggéré avec urgence (non bloquant, informatif)
    const urgencySuggestedRate = urgency?.isUrgent
        ? Math.ceil(billingRate * (1 + (urgencyConfig.surchargeRate ?? 0.35)) * 100) / 100
        : null;

    return {
        breakdown,
        // Totaux
        totalHours:   Math.round(totalHours   * 100) / 100,
        totalCost:    Math.round(totalCost    * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        grossMargin:  Math.round(grossMargin  * 100) / 100,
        marginPct:    Math.round(marginPct    * 100) / 100,
        // Statut
        isAboveMin,
        minRecommendedRate,
        minMarginRate: fc.minMarginRate * 100, // % pour affichage
        // Urgence
        urgency,
        urgencySuggestedRate,
        // Métadonnées
        wage,
        qualificationId,
        agents,
        billingRate,
        isLissee: pricing?.isLissee ?? false,
    };
}

// ============================================================================
// DÉTECTION D'URGENCE
// ============================================================================

/**
 * Détermine si une mission est en situation d'urgence
 * basé sur la fenêtre de temps entre maintenant et le début de la mission.
 *
 * @param {string|null} missionStartDate - Date de début (YYYY-MM-DD)
 * @param {object} urgencyConfig - { enabled, windowHours, surchargeRate }
 * @returns {{ isUrgent: boolean, hoursBeforeStart: number }|null}
 */
export function detectUrgency(missionStartDate, urgencyConfig = {}) {
    if (!missionStartDate || !urgencyConfig.enabled) return null;

    const { windowHours = 24 } = urgencyConfig;
    const now = new Date();

    // Construire la date de début en local (évite les décalages UTC)
    const [year, month, day] = missionStartDate.split('-').map(Number);
    const missionStart = new Date(year, month - 1, day, 0, 0, 0);

    const hoursBeforeStart = (missionStart - now) / (1000 * 60 * 60);

    // Mission déjà commencée ou passée → pas d'urgence
    if (hoursBeforeStart < 0) return { isUrgent: false, hoursBeforeStart: 0 };

    return {
        isUrgent:         hoursBeforeStart <= windowHours,
        hoursBeforeStart: Math.round(hoursBeforeStart * 10) / 10,
    };
}

// ============================================================================
// CALCUL DU SNAPSHOT (pour audit devis)
// ============================================================================

/**
 * Produit un snapshot compact pour stockage dans le devis (audit trail).
 * @param {object|null} result - Résultat de calcProfitability()
 * @returns {object|null}
 */
export function buildProfitabilitySnapshot(result) {
    if (!result) return null;

    return {
        totalCost:    result.totalCost,
        totalRevenue: result.totalRevenue,
        grossMargin:  result.grossMargin,
        marginPct:    result.marginPct,
        isAboveMin:   result.isAboveMin,
        isUrgent:     result.urgency?.isUrgent ?? false,
        isLissee:     result.isLissee,
        wage:         result.wage,
        agents:       result.agents,
        calculatedAt: new Date().toISOString(),
    };
}
