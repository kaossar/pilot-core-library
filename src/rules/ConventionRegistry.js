/**
 * ConventionRegistry.js — Registre Centralisé et Résolveur Multi-Conventions Collectives
 * 
 * Responsabilité :
 * 1. Enregistrer et cataloguer les profils conventionnels officiels de PILOT OS.
 * 2. Résoudre le profil applicable en fonction de l'IDCC, de la date de la vacation/période
 *    et des règles personnalisées d'entreprise (Niveau B).
 * 3. IMPÉRATIF JURIDIQUE ABSOLU : Ne JAMAIS appliquer l'IDCC 1351 (Sécurité) à une entreprise
 *    qui n'en relève pas expressément. Repli sur le Droit Commun (IDCC 9999) si non spécifié.
 * 
 * Commentaires 100 % en français.
 */

import { IDCC_1351_RULES_2026, getIdcc1351Rules } from './idcc1351/idcc1351Rules.js';
import { IDCC_3173_RULES_2026, getIdcc3173Rules } from './idcc3173/idcc3173Rules.js';
import { IDCC_2098_RULES_2026, getIdcc2098Rules } from './idcc2098/idcc2098Rules.js';
import { COMMON_LAW_RULES_2026, getCommonLawRules } from './commonLaw/commonLawRules.js';
import { RULE_STATUS, RULE_LEVELS } from './ConventionRuleSchema.js';

export class ConventionRegistry {
    /**
     * Dictionnaire des résolveurs par IDCC officiel.
     */
    static PROFILES = {
        '1351': {
            idcc: '1351',
            label: "Prévention et Sécurité (IDCC 1351)",
            fullName: "Convention collective nationale des entreprises de prévention et de sécurité",
            industry: 'security',
            resolver: getIdcc1351Rules,
            defaultRules: IDCC_1351_RULES_2026,
            verified: true,
            source: "Journal Officiel — Brochure 3196 / IDCC 1351"
        },
        '3173': {
            idcc: '3173',
            label: "Propreté et Services Associés (IDCC 3173)",
            fullName: "Convention collective nationale des entreprises de propreté et services associés",
            industry: 'cleaning',
            resolver: getIdcc3173Rules,
            defaultRules: IDCC_3173_RULES_2026,
            verified: true,
            source: "Journal Officiel — Brochure 3173 / IDCC 3173"
        },
        '2098': {
            idcc: '2098',
            label: "Accueil & Services Tertiaires (IDCC 2098)",
            fullName: "Convention collective nationale du personnel des entreprises de services tertiaires - Accueil",
            industry: 'reception',
            resolver: getIdcc2098Rules,
            defaultRules: IDCC_2098_RULES_2026,
            verified: true,
            source: "Journal Officiel — Brochure 3301 / IDCC 2098"
        },
        '9999': {
            idcc: '9999',
            label: "Droit Commun — Code du Travail (Ordre Public)",
            fullName: "Code du Travail — Régime légal général",
            industry: 'general',
            resolver: getCommonLawRules,
            defaultRules: COMMON_LAW_RULES_2026,
            verified: true,
            source: "Code du Travail de la République Française"
        }
    };

    /**
     * Retourne la liste de toutes les conventions supportées avec leurs métadonnées.
     * @returns {Array<Object>}
     */
    static getSupportedConventions() {
        return Object.values(ConventionRegistry.PROFILES).map(p => ({
            idcc: p.idcc,
            label: p.label,
            fullName: p.fullName,
            industry: p.industry,
            source: p.source,
            verified: p.verified
        }));
    }

    /**
     * Résout le jeu de règles applicable pour un IDCC donné à une date donnée,
     * en appliquant les surcharges légitimes d'entreprise (Niveau B).
     * 
     * @param {Object} params
     * @param {string|number|null} [params.idcc] - Identifiant de la convention collective (ex: '1351', '3173')
     * @param {Date|string} [params.date=new Date()] - Date de référence pour le barème
     * @param {Object|null} [params.customCompanyRules=null] - Paramètres de Niveau B (primes entreprise, etc.)
     * @returns {Object} Jeu de règles effectif validé
     */
    static resolveRules({ idcc, date = new Date(), customCompanyRules = null } = {}) {
        const cleanIdcc = idcc ? String(idcc).trim() : null;

        // RÈGLE CARDINALE : Si aucun IDCC n'est fourni ou s'il est inconnu,
        // ne JAMAIS utiliser l'IDCC 1351 par défaut ! Utiliser le Droit Commun.
        const profile = cleanIdcc ? ConventionRegistry.PROFILES[cleanIdcc] : null;

        let baseRules;
        let isFallback = false;

        if (profile) {
            baseRules = profile.resolver(date);
        } else {
            // Repli sur le Code du Travail
            baseRules = getCommonLawRules(date);
            isFallback = true;
        }

        // Clone profond pour éviter les mutations d'état entre calculs
        const resolved = JSON.parse(JSON.stringify(baseRules));

        if (isFallback) {
            resolved.fallbackActive = true;
            resolved.status = RULE_STATUS.TO_CONFIRM;
            resolved.warning = "Aucune convention collective vérifiée n'a été spécifiée. Application du Code du Travail (Ordre public) par défaut.";
        }

        // Intégration des règles personnalisées d'entreprise (Niveau B)
        // Les règles de niveau B ne peuvent JAMAIS réduire les minimas légaux ou conventionnels (règle de faveur)
        if (customCompanyRules && typeof customCompanyRules === 'object') {
            resolved.customCompanyRulesApplied = true;

            // 1. Primes supplémentaires propres à l'entreprise
            if (customCompanyRules.additionalAllowances) {
                resolved.allowances = {
                    ...resolved.allowances,
                    ...customCompanyRules.additionalAllowances
                };
            }

            // 2. Horaires d'agence personnalisés (si plus favorables ou spécifiques)
            if (customCompanyRules.nightShiftStart && customCompanyRules.nightShiftEnd) {
                resolved.hoursWindows = {
                    nightStart: customCompanyRules.nightShiftStart,
                    nightEnd: customCompanyRules.nightShiftEnd
                };
            }

            // 3. Taux de majoration surélevés par accord d'entreprise (faveur uniquement)
            if (customCompanyRules.premiumsOverrides) {
                for (const [key, override] of Object.entries(customCompanyRules.premiumsOverrides)) {
                    if (resolved.premiums[key] && typeof override.rate === 'number') {
                        // Un accord d'entreprise ne peut pas appliquer un taux inférieur à la convention
                        if (override.rate >= resolved.premiums[key].rate) {
                            resolved.premiums[key].rate = override.rate;
                            resolved.premiums[key].overriddenByCompany = true;
                            resolved.premiums[key].companyAccordRef = override.accordRef || "Accord d'entreprise";
                        }
                    }
                }
            }
        }

        return resolved;
    }
}
