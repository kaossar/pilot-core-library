/**
 * ConventionRuleSchema.js — Spécification et validation du schéma des règles conventionnelles
 * 
 * Formalise les 4 niveaux de règles de PILOT OS :
 * - NIVEAU A : Règle légale et conventionnelle (ordre public ou branche impératif)
 * - NIVEAU B : Paramètre personnalisable d'entreprise (accord d'entreprise, prime interne, code export)
 * - NIVEAU C : Paramètre individuel (contrat, coefficient, ancienneté, spécificités)
 * - NIVEAU D : Exception soumise à validation formelle
 * 
 * Conforme au cahier des charges : pérennité 10+ ans, traçabilité et déterminisme.
 * Commentaires 100 % en français.
 */

export const RULE_LEVELS = {
    LEVEL_A_LEGAL_CONVENTIONAL: 'LEGAL_CONVENTIONAL', // Règles impératives
    LEVEL_B_COMPANY_CUSTOM:     'COMPANY_CUSTOM',      // Paramètres entreprise
    LEVEL_C_INDIVIDUAL:         'INDIVIDUAL',          // Spécificités contrat salarié
    LEVEL_D_VERIFICATION_REQ:   'VERIFICATION_REQ'     // Exceptions avec validation requise
};

export const RULE_STATUS = {
    DRAFT:        'BROUILLON',
    VERIFIED:     'VERIFIEE',
    ACTIVE:       'ACTIVE',
    EXPIRED:      'EXPIREE',
    TO_CONFIRM:   'A_CONFIRMER'
};

export const BASE_CALCULATION_BASIS = {
    CONVENTIONAL_MIN: 'CONVENTIONAL_MIN', // Minimum conventionnel du coefficient
    EFFECTIVE_SALARY: 'EFFECTIVE_SALARY', // Salaire contractuel réel
    LEGAL_SMIC:       'LEGAL_SMIC',       // SMIC horaire de référence
    FIXED_AMOUNT:     'FIXED_AMOUNT',     // Montant forfaitaire en euros
    HOURLY_AMOUNT:    'HOURLY_AMOUNT'     // Montant fixe par heure travaillée
};

export const RULE_UNITS = {
    HOUR:    'HEURE',
    DAY:     'JOUR',
    SHIFT:   'VACATION',
    MONTH:   'MOIS',
    FLAT:    'FORFAIT',
    PERCENT: 'POURCENTAGE'
};

/**
 * Valide qu'un objet règle conventionnelle respecte la structure minimale requise.
 * @param {Object} rule - Définition de la règle
 * @returns {boolean}
 */
export function validateConventionRule(rule) {
    if (!rule || typeof rule !== 'object') {
        throw new Error("La règle doit être un objet non null.");
    }
    const required = ['id', 'name', 'idcc', 'articleRef', 'validFrom', 'level', 'baseBasis', 'unit', 'status'];
    for (const field of required) {
        if (!rule[field]) {
            throw new Error(`La règle conventionnelle '${rule.id || 'sans id'}' est invalide : champ obligatoire '${field}' manquant.`);
        }
    }
    return true;
}
