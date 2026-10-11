/**
 * collaboratorEnums.js — Référentiel Métier des Collaborateurs PILOT OS
 *
 * Architecture Découplée & Multi-Secteurs (Pérennité 10+ ans) :
 * 1. Nature de la relation juridique (employé direct, intérimaire, sous-traitant, TNS)
 * 2. Cadre contractuel (CDI, CDD, mise à disposition ETT, contrat de prestation)
 * 3. Cycle de vie RH (vivier/candidat, onboarding, actif administratif, sorti)
 * 4. Disponibilité opérationnelle journalière (disponible, affecté, repos légal, congé, arrêt maladie)
 * 5. Sous-système Mobilisation d'Urgence / Astreinte (machine d'état de sollicitation)
 * 6. Règles de repos configurables & dérogations conventionnelles
 * 7. Contrôles réglementaires conditionnels (CNAPS, SSIAP, SST, Droit commun)
 */

// =============================================================================
// 1. RELATION JURIDIQUE AVEC L'ENTREPRISE UTILISATRICE
// =============================================================================

export const LEGAL_RELATIONSHIPS = Object.freeze({
    DIRECT_EMPLOYEE: {
        id: 'DIRECT_EMPLOYEE',
        label: 'Salarié direct',
        description: 'Collaborateur sous contrat de travail direct avec l\'agence (DPAE, Paie interne, RUP standard)',
        requiresPayroll: true,
        requiresRup: true,
        rupSection: 'SALARIES_DIRECTS'
    },
    TEMPORARY_WORKER: {
        id: 'TEMPORARY_WORKER',
        label: 'Salarié intérimaire',
        description: 'Personnel mis à disposition par une Entreprise de Travail Temporaire (ETT) tierce',
        requiresPayroll: false, // Rémunéré et facturé par l'agence d'intérim
        requiresRup: true,      // Obligation légale Article L1221-13 Code du Travail (mention ETT)
        rupSection: 'SALARIES_TEMPORAIRES'
    },
    SUBCONTRACTOR_WORKER: {
        id: 'SUBCONTRACTOR_WORKER',
        label: 'Intervenant sous-traitant',
        description: 'Salarié d\'une entreprise sous-traitante partenaire titulaire des agréments légaux',
        requiresPayroll: false,
        requiresRup: false,     // Ne figure pas au RUP de l'entreprise utilisatrice
        rupSection: null
    },
    INDEPENDENT_CONTRACTOR: {
        id: 'INDEPENDENT_CONTRACTOR',
        label: 'Indépendant / TNS',
        description: 'Professionnel libéral ou auto-entrepreneur titulaire de son propre numéro SIRET',
        requiresPayroll: false,
        requiresRup: false,
        rupSection: null
    }
});

// =============================================================================
// 2. CADRE CONTRACTUEL ET JURIDIQUE D'INTERVENTION
// =============================================================================

export const CONTRACT_FRAMEWORKS = Object.freeze({
    // Pour Salariés directs
    CDI: {
        id: 'CDI',
        label: 'Contrat à Durée Indéterminée (CDI)',
        allowedRelationships: ['DIRECT_EMPLOYEE'],
        hasEndDate: false
    },
    CDD: {
        id: 'CDD',
        label: 'Contrat à Durée Déterminée (CDD)',
        allowedRelationships: ['DIRECT_EMPLOYEE'],
        hasEndDate: true
    },
    CDDU: {
        id: 'CDDU',
        label: 'CDD d\'Usage / Extra (CDDU)',
        allowedRelationships: ['DIRECT_EMPLOYEE'],
        hasEndDate: true
    },
    APPRENTICESHIP: {
        id: 'APPRENTICESHIP',
        label: 'Contrat d\'Apprentissage / Professionnalisation',
        allowedRelationships: ['DIRECT_EMPLOYEE'],
        hasEndDate: true
    },
    // Pour Intérimaires
    TEMPORARY_ASSIGNMENT: {
        id: 'TEMPORARY_ASSIGNMENT',
        label: 'Contrat de mise à disposition (Intérim)',
        allowedRelationships: ['TEMPORARY_WORKER'],
        hasEndDate: true
    },
    // Pour Sous-traitants
    SUBCONTRACTING_AGREEMENT: {
        id: 'SUBCONTRACTING_AGREEMENT',
        label: 'Contrat / Bon de commande de sous-traitance',
        allowedRelationships: ['SUBCONTRACTOR_WORKER'],
        hasEndDate: true
    },
    // Pour Indépendants
    SERVICE_CONTRACT: {
        id: 'SERVICE_CONTRACT',
        label: 'Contrat de prestation de services libérale',
        allowedRelationships: ['INDEPENDENT_CONTRACTOR'],
        hasEndDate: true
    }
});

// =============================================================================
// 3. CYCLE DE VIE RH DE L'INDIVIDU (SOUVERAINETÉ SIRH)
// =============================================================================

export const RH_LIFECYCLE_STAGES = Object.freeze({
    CANDIDATE: {
        id: 'CANDIDATE',
        label: 'Candidat (Vivier de recrutement)',
        description: 'Dossier de candidature reçu ou sourcé. Pièces en cours d\'examen. Strictement non affectable au planning.',
        isPlanifiable: false
    },
    ONBOARDING: {
        id: 'ONBOARDING',
        label: 'En cours d\'onboarding',
        description: 'Recrutement retenu. Collecte et contrôle probant des pièces justificatives obligatoires.',
        isPlanifiable: false
    },
    REGISTERED: {
        id: 'REGISTERED',
        label: 'Dossier administratif actif',
        description: 'Dossier administratif validé, contrat signé et conformités vérifiées.',
        isPlanifiable: true // Éligible sous réserve des vérifications dynamiques à la date de vacation
    },
    SUSPENDED: {
        id: 'SUSPENDED',
        label: 'Contrat suspendu',
        description: 'Suspension administrative longue durée (congé parental, sabbatique, sans solde).',
        isPlanifiable: false
    },
    OFFBOARDED: {
        id: 'OFFBOARDED',
        label: 'Sorti / Archivé',
        description: 'Fin de contrat, démission ou rupture. Dossier conservé au RUP pour archivage légal 5 ans.',
        isPlanifiable: false
    }
});

// =============================================================================
// 4. SITUATION DE DISPONIBILITÉ OPÉRATIONNELLE (TEMPS RÉEL)
// =============================================================================

export const OPERATIONAL_AVAILABILITY = Object.freeze({
    AVAILABLE: {
        id: 'AVAILABLE',
        label: 'Disponible',
        isMobilisable: true
    },
    ASSIGNED: {
        id: 'ASSIGNED',
        label: 'En vacation / Affecté',
        isMobilisable: false
    },
    REST_DAILY: {
        id: 'REST_DAILY',
        label: 'En repos quotidien obligatoire',
        isMobilisable: false
    },
    REST_WEEKLY: {
        id: 'REST_WEEKLY',
        label: 'En repos hebdomadaire obligatoire',
        isMobilisable: false
    },
    LEAVE: {
        id: 'LEAVE',
        label: 'En congé / RTT autorisé',
        isMobilisable: false
    },
    SICK: {
        id: 'SICK',
        label: 'En arrêt de travail / Maladie',
        isMobilisable: false
    },
    UNAVAILABLE: {
        id: 'UNAVAILABLE',
        label: 'Indisponible déclaré',
        isMobilisable: false
    }
});

// =============================================================================
// 5. SOUS-SYSTÈME MOBILISATION D'URGENCE & ASTREINTE
// =============================================================================

export const EMERGENCY_MOBILIZATION_STATUS = Object.freeze({
    REGISTERED_POOL: {
        id: 'REGISTERED_POOL',
        label: 'Inscrit au Pool Urgence / Astreinte',
        description: 'Collaborateur volontaire ou d\'astreinte avec rayon d\'action et délai de prévenance garantis'
    },
    SOLICITED: {
        id: 'SOLICITED',
        label: 'Sollicité pour vacation urgente',
        description: 'Notification push / SMS transmise, en attente de réponse dans le délai imparti'
    },
    CONFIRMED: {
        id: 'CONFIRMED',
        label: 'Mobilisation confirmée',
        description: 'Vacation urgente acceptée par le collaborateur et verrouillée sur le planning'
    },
    DECLINED: {
        id: 'DECLINED',
        label: 'Mobilisation refusée',
        description: 'Vacation refusée par le collaborateur pour ce créneau'
    },
    UNRESPONSIVE: {
        id: 'UNRESPONSIVE',
        label: 'Sans réponse',
        description: 'Délai d\'acceptation expiré sans confirmation'
    }
});

// =============================================================================
// 6. RÈGLES DE REPOS ET DÉROGATIONS CONVENTIONNELLES CONFIGURABLES
// =============================================================================

export const REST_REGULATION_MODES = Object.freeze({
    LEGAL_STANDARD: {
        id: 'LEGAL_STANDARD',
        label: 'Régime légal standard',
        minDailyRestHours: 11,     // Art. L3131-1 Code du Travail
        minWeeklyRestHours: 35,    // 24h + 11h consécutives
        requiresCompensatoryRest: false
    },
    DEROGATION_URGENCY: {
        id: 'DEROGATION_URGENCY',
        label: 'Dérogation pour urgence ou surcroît exceptionnel',
        minDailyRestHours: 9,      // Dérogation légale admissible sous conditions
        minWeeklyRestHours: 35,
        requiresCompensatoryRest: true // Attribution obligatoire de repos compensateur équivalent
    },
    DEROGATION_SECTORIAL: {
        id: 'DEROGATION_SECTORIAL',
        label: 'Dérogation prévue par accord de branche / convention collective',
        minDailyRestHours: 9,
        minWeeklyRestHours: 35,
        requiresCompensatoryRest: true
    },
    ON_CALL_DUTY: {
        id: 'ON_CALL_DUTY',
        label: 'Régime d\'astreinte',
        minDailyRestHours: 11,
        requiresCompensatoryRest: false
    }
});

// =============================================================================
// 7. CONTRÔLES RÉGLEMENTAIRES CONDITIONNELS SELON L'ACTIVITÉ ET LE SECTEUR
// =============================================================================

export const REGULATORY_ACTIVITY_SCOPES = Object.freeze({
    SECURITY_PRIVATE: {
        id: 'SECURITY_PRIVATE',
        label: 'Sécurité privée & Surveillance humaine',
        requiresCnaps: true,           // Carte pro CNAPS obligatoire (Livre VI CSI)
        requiresSsiap: false,
        requiresMedicalFitness: true,  // Visite médicale d'aptitude
        requiresWorkPermit: true       // Titre de séjour / CNI
    },
    FIRE_SAFETY: {
        id: 'FIRE_SAFETY',
        label: 'Sécurité Incendie & Assistance à Personnes (SSIAP)',
        requiresCnaps: false,          // Le SSIAP pur ne dépend pas du CNAPS
        requiresSsiap: true,           // Diplôme SSIAP 1/2/3 obligatoire
        requiresMedicalFitness: true,
        requiresWorkPermit: true
    },
    CYNOPHILE: {
        id: 'CYNOPHILE',
        label: 'Sécurité Cynophile (Agent conducteur de chien)',
        requiresCnaps: true,           // Carte pro avec mention surveillance cynophile
        requiresDogDocuments: true,    // Carnet de vaccination, ICAD, certificat d'aptitude du chien
        requiresMedicalFitness: true,
        requiresWorkPermit: true
    },
    RECEPTION_HOSPITALITY: {
        id: 'RECEPTION_HOSPITALITY',
        label: 'Accueil & Hospitalité (IDCC 2098)',
        requiresCnaps: false,          // AUCUNE exigence CNAPS
        requiresSsiap: false,
        requiresMedicalFitness: true,
        requiresWorkPermit: true
    },
    CLEANING_FACILITY: {
        id: 'CLEANING_FACILITY',
        label: 'Propreté & Services Généraux',
        requiresCnaps: false,          // AUCUNE exigence CNAPS
        requiresSsiap: false,
        requiresMedicalFitness: true,
        requiresWorkPermit: true
    },
    ADMINISTRATIVE: {
        id: 'ADMINISTRATIVE',
        label: 'Fonctions support & Administration',
        requiresCnaps: false,
        requiresSsiap: false,
        requiresMedicalFitness: true,
        requiresWorkPermit: true
    }
});

// =============================================================================
// 8. FONCTIONS PURS DE VÉRIFICATION DE COHÉRENCE ET D'ÉLIGIBILITÉ
// =============================================================================

/**
 * Détermine si une activité requiert obligatoirement une carte professionnelle CNAPS.
 * @param {string} activityScopeId - Identifiant du scope d'activité
 * @returns {boolean}
 */
export function isCnapsMandatory(activityScopeId) {
    const scope = REGULATORY_ACTIVITY_SCOPES[activityScopeId];
    return scope ? Boolean(scope.requiresCnaps) : false;
}

/**
 * Détermine si le cycle de vie RH autorise en principe la planification d'un collaborateur.
 * RÈGLE D'OR : Les candidats et les profils sortis sont formellement exclus du planning.
 * @param {string} lifecycleStageId - Identifiant du stade de cycle de vie RH
 * @returns {boolean}
 */
export function isLifecycleStagePlanifiable(lifecycleStageId) {
    const stage = RH_LIFECYCLE_STAGES[lifecycleStageId];
    return stage ? Boolean(stage.isPlanifiable) : false;
}

/**
 * Retourne les types de contrats juridiquement autorisés pour une relation donnée.
 * @param {string} relationshipId - Identifiant de la relation juridique
 * @returns {Array<string>} Liste des codes de cadre contractuel autorisés
 */
export function getAllowedContractFrameworks(relationshipId) {
    return Object.values(CONTRACT_FRAMEWORKS)
        .filter(fw => fw.allowedRelationships.includes(relationshipId))
        .map(fw => fw.id);
}
