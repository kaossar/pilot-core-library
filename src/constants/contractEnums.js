/**
 * contractEnums.js — Source de vérité unique des enums contrats PILOT
 *
 * Ce fichier est la SEULE source de vérité pour tous les statuts et types
 * de contrats. Il est importé côté front (via @shared/core) et côté back.
 *
 * Règle absolue : ne jamais dupliquer ces valeurs ailleurs.
 * Toute modification ici doit s'accompagner d'une migration Drizzle.
 *
 * @module contractEnums
 * @version 1.1.0 — Refonte Elite 2026-04 (CDDU requalification risk)
 */

// =============================================================================
// STATUTS DU CYCLE DE VIE
// =============================================================================

/**
 * Cycle de vie d'un contrat :
 *
 *  ENREGISTRE ──► ACTIF ──► SIGNE ──► RESILIE (motif obligatoire)
 *                   │           │
 *                   └───────────┴──► TERMINE (motif obligatoire)
 *                                        │
 *                                     EXPIRE  (CDD auto via CRON)
 *
 * Règles d'immutabilité :
 *  - ENREGISTRE : modifiable + soft-deletable
 *  - ACTIF      : partiellement modifiable, non supprimable
 *  - SIGNE      : JAMAIS modifiable, JAMAIS supprimable
 *  - Terminaux  : RESILIE, TERMINE, EXPIRE — aucune action possible
 */
export const CONTRACT_STATUS = Object.freeze({
    ENREGISTRE: 'ENREGISTRE', // Créé, PDF non encore généré
    ACTIF:      'ACTIF',      // PDF généré, en attente de signature interne ou envoi
    EN_SIGNATURE: 'EN_SIGNATURE', // Envoyé à l'agent (Magic Link actif)
    SIGNE:      'SIGNE',      // Signé — immuable, avenant possible
    RESILIE:    'RESILIE',    // Rupture anticipée (motif obligatoire)
    TERMINE:    'TERMINE',    // Fin naturelle (motif obligatoire)
    EXPIRE:     'EXPIRE',     // CDD expiré automatiquement (CRON)
});

/** Statuts considérés comme "opérationnels" (contrat en vigueur) */
export const CONTRACT_STATUS_ACTIVE = Object.freeze([
    CONTRACT_STATUS.ACTIF,
    CONTRACT_STATUS.EN_SIGNATURE,
    CONTRACT_STATUS.SIGNE,
]);

/** Statuts terminaux — aucune transition possible */
export const CONTRACT_STATUS_TERMINAL = Object.freeze([
    CONTRACT_STATUS.RESILIE,
    CONTRACT_STATUS.TERMINE,
    CONTRACT_STATUS.EXPIRE,
]);

/** Statuts permettant de créer un avenant (CDI et CDD, une fois signés) */
export const CONTRACT_STATUS_AMENDABLE = Object.freeze([
    CONTRACT_STATUS.SIGNE,
    // Valable pour CDI ET CDD — le type de contrat n'est pas restrictif
]);

// =============================================================================
// TYPES DE CONTRAT
// =============================================================================

export const CONTRACT_TYPE = Object.freeze({
    CDI: 'CDI', // Durée indéterminée (droit commun)
    CDD: 'CDD', // Durée déterminée

    /**
     * NB : il n'y a pas de type VACATION distinct.
     * Un CDDU (vacation) EST un CDD avec motifCDD === 'USAGE'.
     * Le système détecte automatiquement ce cas via isCDDU(contract).
     *
     * Règles CDDU auto-appliquées quand motifCDD === 'USAGE' :
     *   - Carence : non calculée (L.1244-4)
     *   - Période d'essai : aucune
     *   - Durée : alignée sur la mission (obligatoire)
     *   - Risque requalification CDI : calculé indépendamment
     */
});

// =============================================================================
// RÈGLES MÉTIER PAR TYPE — Valeurs par défaut à la création
// =============================================================================

/**
 * Valeurs pré-remplies automatiquement selon le type de contrat.
 * Appliquées dans contractLifecycleService.applyTypeDefaults().
 */
export const CONTRACT_TYPE_DEFAULTS = Object.freeze({
    [CONTRACT_TYPE.CDI]: {
        motifCDD:              null,
        carenceExemptionMotif: null,
        periodeEssaiMois:      2,    // IDCC 1351 catégorie SURVEILLANCE par défaut
    },
    [CONTRACT_TYPE.CDD]: {
        motifCDD:              null, // Obligatoire — saisi par le RH
        carenceExemptionMotif: null, // Optionnel — saisi si exemption L.1244-4
        periodeEssaiMois:      null, // Calculé selon durée CDD (L.1242-10)
    },
    // CDD avec motifCDD === 'USAGE' (CDDU) : surcharges appliquées AUTO dans contractLifecycleService
    // motifCDD: 'USAGE', carenceExemptionMotif: 'USAGE', periodeEssaiMois: null
});

/**
 * Types de contrat soumis AU CALCUL DE CARENCE (L.1244-3).
 *
 * ⚠️ VACATION (CDDU) est EXCLU :
 *   La carence ne s'applique pas au CDDU en secteur d'usage (L.1244-4).
 *   Le risque CDDU est géré séparément via le moteur de requalification CDI.
 */
export const CONTRACT_TYPES_WITH_CARENCE = Object.freeze([CONTRACT_TYPE.CDD]);

/**
 * Types de contrat pour lesquels une période d'essai IDCC 1351 s'applique.
 * VACATION exclu — pas de PE pour un CDDU.
 */
export const CONTRACT_TYPES_WITH_PERIODE_ESSAI = Object.freeze([
    CONTRACT_TYPE.CDI,
    CONTRACT_TYPE.CDD,
]);

// =============================================================================
// RISQUE DE REQUALIFICATION CDI (CDDU / VACATION uniquement)
// =============================================================================

/**
 * Seuils de détection du risque de requalification CDI pour les CDDU.
 *
 * Ce moteur est INDÉPENDANT du calcul de carence (qui ne s'applique pas au CDDU).
 * Il produit une alerte non bloquante à destination du RH / tableau de bord.
 *
 * UX dashboard :
 *   AUCUN  : ✔ Aucun indicateur détecté (VACATION normal)
 *   MOYEN  : 🟠 Succession de missions élevée — surveiller
 *   ELEVE  : 🔴 Risque de requalification CDI — recommander passage CDI
 */
export const CDDU_REQUALIFICATION_THRESHOLDS = Object.freeze({
    // Jours consécutifs travaillés au-delà desquels le risque devient élevé
    JOURS_CONSECUTIFS_ELEVE:  60,
    // Nombre de missions sur le même site / 12 mois → risque moyen
    MISSIONS_MEME_SITE_MOYEN: 8,
    // Nombre de missions sur le même site / 12 mois → risque élevé
    MISSIONS_MEME_SITE_ELEVE: 15,
    // Taux de présence sur 12 mois (% jours ouvrables) → CDI déguisé suspecté
    TAUX_PRESENCE_ELEVE:      0.70,
});

/**
 * Indicateurs individuels du risque de requalification CDDU.
 * Chaque indicateur positif incrémente le score global.
 */
export const CDDU_REQUALIFICATION_INDICATOR = Object.freeze({
    CONTINUITE_SANS_INTERRUPTION: 'CONTINUITE_SANS_INTERRUPTION', // même agent, même site, 0 jour vide
    VOLUME_JOURS_ELEVE:           'VOLUME_JOURS_ELEVE',           // > seuil sur 12 mois
    MISSIONS_REPETEES_MEME_SITE:  'MISSIONS_REPETEES_MEME_SITE',  // > seuil missions/site/an
    TAUX_PRESENCE_ELEVE:          'TAUX_PRESENCE_ELEVE',          // > 70% des jours ouvrables
    POSTE_PERMANENT_APPARENT:     'POSTE_PERMANENT_APPARENT',     // même qualification + mêmes horaires fixes
});

export const RISQUE_REQUALIFICATION = Object.freeze({
    AUCUN: 'AUCUN',
    MOYEN: 'MOYEN',
    ELEVE: 'ELEVE',
});

// =============================================================================
// TRANSITIONS AUTORISÉES (FSM — Machine à états)
// =============================================================================

/**
 * Transitions d'état autorisées.
 * Toute transition absente de cette map est interdite (→ 400).
 *
 * Exemple d'usage backend :
 *   if (!CONTRACT_TRANSITIONS[current].includes(next)) return 400;
 */
export const CONTRACT_TRANSITIONS = Object.freeze({
    [CONTRACT_STATUS.ENREGISTRE]: [CONTRACT_STATUS.ACTIF],
    [CONTRACT_STATUS.ACTIF]:      [CONTRACT_STATUS.EN_SIGNATURE, CONTRACT_STATUS.SIGNE, CONTRACT_STATUS.TERMINE],
    [CONTRACT_STATUS.EN_SIGNATURE]: [CONTRACT_STATUS.SIGNE, CONTRACT_STATUS.ACTIF, CONTRACT_STATUS.TERMINE],
    [CONTRACT_STATUS.SIGNE]:      [CONTRACT_STATUS.RESILIE, CONTRACT_STATUS.TERMINE],
    [CONTRACT_STATUS.RESILIE]:    [], // état terminal
    [CONTRACT_STATUS.TERMINE]:    [], // état terminal
    [CONTRACT_STATUS.EXPIRE]:     [], // état terminal (CDD auto CRON)
});

/**
 * Champs de motif obligatoires par transition.
 * Clé = 'STATUT_ACTUEL→STATUT_CIBLE'
 */
export const CONTRACT_TRANSITION_REQUIRED_FIELDS = Object.freeze({
    [`${CONTRACT_STATUS.SIGNE}→${CONTRACT_STATUS.RESILIE}`]:  'resilieMotif',
    [`${CONTRACT_STATUS.ACTIF}→${CONTRACT_STATUS.TERMINE}`]:  'termineMotif',
    [`${CONTRACT_STATUS.SIGNE}→${CONTRACT_STATUS.TERMINE}`]:  'termineMotif',
});

// =============================================================================
// MOTIFS CDD (L.1242-2 Code du travail)
// =============================================================================

export const MOTIF_CDD = Object.freeze({
    ACCROISSEMENT_ACTIVITE: 'ACCROISSEMENT_ACTIVITE',
    REMPLACEMENT:           'REMPLACEMENT',
    SAISONNIER:             'SAISONNIER',
    USAGE:                  'USAGE',
});

export const MOTIF_CDD_LABELS = Object.freeze({
    [MOTIF_CDD.ACCROISSEMENT_ACTIVITE]: "Accroissement temporaire d'activité",
    [MOTIF_CDD.REMPLACEMENT]:           "Remplacement d'un salarié absent",
    [MOTIF_CDD.SAISONNIER]:             'Emploi à caractère saisonnier',
    [MOTIF_CDD.USAGE]:                  "Emploi d'usage (non recours habituel au CDI)",
});

// =============================================================================
// EXEMPTIONS DE CARENCE CDD (L.1244-4 Code du travail)
// =============================================================================

export const CARENCE_EXEMPTION = Object.freeze({
    REMPLACEMENT:     'REMPLACEMENT',
    SAISONNIER:       'SAISONNIER',
    USAGE:            'USAGE',
    FAUTE_GRAVE:      'FAUTE_GRAVE',
    REFUS_CDI:        'REFUS_CDI',
    CDD_INSERTION:    'CDD_INSERTION',
    CONTRAT_AIDE:     'CONTRAT_AIDE',
    POLITIQUE_EMPLOI: 'POLITIQUE_EMPLOI',
});

export const CARENCE_EXEMPTION_LABELS = Object.freeze({
    [CARENCE_EXEMPTION.REMPLACEMENT]:     'Remplacement salarié absent (L.1244-4)',
    [CARENCE_EXEMPTION.SAISONNIER]:       'Emploi saisonnier',
    [CARENCE_EXEMPTION.USAGE]:            "Emploi d'usage",
    [CARENCE_EXEMPTION.FAUTE_GRAVE]:      'Rupture CDD précédent par faute grave du salarié',
    [CARENCE_EXEMPTION.REFUS_CDI]:        "Refus CDI proposé par l'employeur",
    [CARENCE_EXEMPTION.CDD_INSERTION]:    "CDD d'insertion (IAE)",
    [CARENCE_EXEMPTION.CONTRAT_AIDE]:     'Contrat aidé (PEC, CIE…)',
    [CARENCE_EXEMPTION.POLITIQUE_EMPLOI]: "CDD politique de l'emploi",
});

// =============================================================================
// ACTIONS D'AUDIT LOG
// =============================================================================

export const CONTRACT_AUDIT_ACTION = Object.freeze({
    CREATE:          'CREATE_CONTRAT',
    UPDATE:          'UPDATE_CONTRAT',
    GENERATE_PDF:    'GENERATE_PDF',
    SIGN:            'SIGN_CONTRAT',
    CREATE_AVENANT:  'CREATE_AVENANT',
    RESILIATION:     'RESILIATION',
    SOFT_DELETE:     'SOFT_DELETE_CONTRAT',
    ALERT_TRIGGERED: 'ALERT_TRIGGERED',
    STATUS_CHANGE:   'STATUS_CHANGE',
});

// =============================================================================
// TYPES D'ALERTES CRON — Séparées par domaine
// =============================================================================

export const CONTRACT_ALERT_TYPE = Object.freeze({
    // —— Alertes CDD classique —————————————————————————————
    CDD_EXPIRY:           'CDD_EXPIRY',          // CDD expire à J-30 / J-7
    CDD_EXPIRED:          'CDD_EXPIRED',         // CDD expiré non clôturé
    CARENCE_VIOLATION:    'CARENCE_VIOLATION',   // Carence CDD classique non respectée (L.1244-3)

    // —— Alertes CDDU (CDD motif USAGE) ————————————————————————
    REQUALIFICATION_RISK: 'REQUALIFICATION_RISK', // Risque requalification CDI (non bloquant, RH)

    // —— Alertes heures (CDI + CDD) ——————————————————————————
    /**
     * Dépassement d'heures contractuelles.
     * Déclenché au planning avant affectation ET en dashboard RH (constat).
     *
     * Deux contextes :
     *   - Au PLANNING : alerte bloquante/avertissement avant affectation
     *   - EN DASHBOARD : constat mensuel (heures réalisées vs contractuelles)
     *
     * Concerne : CDI temps partiel (L.3123-1), CDI temps plein (35h+),
     *            CDD (heures contractuelles définies dans le contrat).
     */
    HEURES_SUP_DEPASSEMENT: 'HEURES_SUP_DEPASSEMENT', // H. contract. dépassées — risque HS + primes
    HEURES_COMPLEMENTAIRES: 'HEURES_COMPLEMENTAIRES', // Temps partiel : h. compl. > 1/3 H.contrat (L.3123-20)

    // —— Alertes documents & conformité ———————————————————————
    PE_EXPIRY:            'PE_EXPIRY',           // Période d'essai approche
    CARTE_PRO_EXPIRY:     'CARTE_PRO_EXPIRY',    // Carte Pro expire (blocage partiel selon mission)
    PDF_MISSING:          'PDF_MISSING',         // ACTIF sans PDF depuis 7j
    RENEWAL_POSSIBLE:     'RENEWAL_POSSIBLE',    // Renouvellement CDD disponible
});

// =============================================================================
// SEUILS HEURES CONTRACTUELLES — CDI & CDD
// =============================================================================

/**
 * Seuils d'alerte pour le contrôle des heures contractuelles.
 * Utilisés au planning (avant affectation) et en dashboard RH (constat).
 *
 * Règle clé :
 *   - CDI/CDD temps partiel : heures complémentaires plafonnées à 1/3 des H.contract. (L.3123-20)
 *   - CDI/CDD temps plein : heures supplémentaires à partir de 35h/semaine
 *   - Dépassement = majoration automatique (25% ou 50% selon tranche)
 */
export const HEURES_SUP_THRESHOLDS = Object.freeze({
    // Durée légale hebdomadaire (h) au-delà de laquelle les HS sont obligatoires
    TEMPS_PLEIN_HEBDO: 35,

    // Seuil d'alerte préventive au planning (% des heures contract. restantes dans la semaine)
    ALERTE_PLANNING_SEUIL_POURCENT: 0.80, // Alerte à 80% des heures contract. atteintes

    // Seuil heures complémentaires temps partiel (L.3123-20)
    HEURES_COMPLEMENTAIRES_MAX_RATIO: 1/3, // Max 1/3 des heures contractuelles

    // % de dépassement au-delà duquel l’alerte passe en "critique" (planning bloqué)
    DEPASSEMENT_BLOQUANT_POURCENT: 1.00,  // Dépassement = blocage proposition planning
});


// =============================================================================
// SCORES DE RISQUE
// =============================================================================

/** Score risque URSSAF global (CDD classique — carence, succession) */
export const RISQUE_SCORE = Object.freeze({
    FAIBLE: 'FAIBLE',
    MOYEN:  'MOYEN',
    ELEVE:  'ELEVE',
});

// =============================================================================
// HELPERS — Fonctions utilitaires dérivées des enums
// =============================================================================

/**
 * Vérifie si une transition de statut est autorisée.
 * @param {string} current - Statut actuel
 * @param {string} next    - Statut cible
 * @returns {boolean}
 */
export const isTransitionAllowed = (current, next) => {
    const allowed = CONTRACT_TRANSITIONS[current];
    return Array.isArray(allowed) && allowed.includes(next);
};

/**
 * Retourne le champ de motif obligatoire pour une transition, ou null.
 * @param {string} current
 * @param {string} next
 * @returns {string|null}
 */
export const getRequiredMotifField = (current, next) =>
    CONTRACT_TRANSITION_REQUIRED_FIELDS[`${current}→${next}`] ?? null;

/**
 * Vérifie si un contrat est dans un état terminal (aucune action possible).
 * @param {string} status
 * @returns {boolean}
 */
export const isTerminalStatus = (status) =>
    CONTRACT_STATUS_TERMINAL.includes(status);

/**
 * Vérifie si un contrat peut recevoir un avenant.
 * @param {string} status
 * @returns {boolean}
 */
export const canHaveAmendment = (status) =>
    CONTRACT_STATUS_AMENDABLE.includes(status);

/**
 * Vérifie si un contrat est immuable (SIGNE ou terminal).
 * @param {string} status
 * @returns {boolean}
 */
export const isImmutable = (status) =>
    status === CONTRACT_STATUS.SIGNE || isTerminalStatus(status);

/**
 * Calcule le niveau de risque de requalification CDI pour un CDDU/VACATION.
 * Indépendant du calcul de carence — alerte non bloquante à destination du RH.
 *
 * @param {string[]} indicators      - Liste d'indicateurs CDDU_REQUALIFICATION_INDICATOR déclenchés
 * @param {number}   joursConsecutifs - Jours consécutifs travaillés sur le dernier contrat
 * @returns {'AUCUN'|'MOYEN'|'ELEVE'}
 */
export const computeRequalificationRisk = (indicators = [], joursConsecutifs = 0) => {
    if (
        joursConsecutifs >= CDDU_REQUALIFICATION_THRESHOLDS.JOURS_CONSECUTIFS_ELEVE ||
        indicators.length >= 3
    ) return RISQUE_REQUALIFICATION.ELEVE;

    if (indicators.length >= 1) return RISQUE_REQUALIFICATION.MOYEN;

    return RISQUE_REQUALIFICATION.AUCUN;
};

/**
 * Détermine si un contrat est un CDD d'usage (CDDU / vacation).
 * La vacation n'est PAS un type distinct — c'est un CDD avec motifCDD === 'USAGE'.
 *
 * Usage : isCDDU(contract) → applique automatiquement les règles CDDU
 *   (pas de carence, pas de PE, calcul requalification)
 *
 * @param {{ type: string, motifCDD: string|null }} contract
 * @returns {boolean}
 */
export const isCDDU = (contract) =>
    contract?.type === CONTRACT_TYPE.CDD && contract?.motifCDD === MOTIF_CDD.USAGE;

/**
 * Détermine si un contrat est à temps partiel.
 * Déclenche les règles heures complémentaires (plafond 1/3, L.3123-20).
 *
 * @param {{ heuresMensuelles: number }} contract
 * @returns {boolean}
 */
export const isTempsPartiel = (contract) => {
    if (!contract?.heuresMensuelles) return false;
    const hebdo = contract.heuresMensuelles / (52 / 12);
    return hebdo < HEURES_SUP_THRESHOLDS.TEMPS_PLEIN_HEBDO;
};

