/**
 * qualificationLabels.js — Libellés des qualifications d'agent (SOURCE UNIQUE)
 *
 * Les qualifications conventionnelles (ads_qualifie, ads_confirme…) tirent leur libellé
 * du référentiel IDCC 1351. Seules les qualifications historiques absentes du référentiel
 * (SSIAP, rondier, maître-chien…) sont déclarées ici. Ne jamais recopier ces libellés
 * dans un contrôleur ou un générateur de PDF : utiliser getQualificationLabel.
 */
import { getProfessionById } from './idcc1351.js';

/** Qualifications historiques hors référentiel IDCC. */
export const LEGACY_QUALIFICATION_LABELS = Object.freeze({
    ssiap_1: 'SSIAP 1',
    ssiap_2: 'SSIAP 2',
    ssiap_3: 'SSIAP 3',
    chef_poste: 'Chef de poste',
    rondier: 'Agent de sécurité rondier',
    maitre_chien: 'Agent de sécurité cynophile'
});

/**
 * Libellé d'une qualification.
 * Ordre : qualification historique → métier IDCC 1351 → identifiant brut → valeur de repli.
 * @param {string|null|undefined} id
 * @param {string} [fallback=''] Retourné si aucun identifiant n'est fourni
 * @returns {string}
 */
export const getQualificationLabel = (id, fallback = '') => {
    if (!id) return fallback;
    return LEGACY_QUALIFICATION_LABELS[id] ?? getProfessionById(id)?.label ?? id;
};
