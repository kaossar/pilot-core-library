/**
 * clientEnums.js - Référentiel des typologies juridiques et statuts clients
 *
 * PILOT OS - Module Gestion Commerciale & CRM
 * Architecture pérenne 10+ ans selon la Clean Architecture et les règles PILOT.
 * Tous les commentaires sont en français.
 */

/**
 * Typologies des clients PILOT OS
 * Catégories de présentation et de profilage commercial
 */
export const CLIENT_TYPES = Object.freeze({
    ENTREPRISE: Object.freeze({
        id: 'ENTREPRISE',
        label: 'Entreprise',
        code: 'B2B',
        description: 'Entreprise cliente, société ou entrepreneur individuel',
    }),

    PARTICULIER: Object.freeze({
        id: 'PARTICULIER',
        label: 'Particulier',
        code: 'B2C',
        description: 'Personne physique agissant à titre privé',
    }),

    ASSOCIATION: Object.freeze({
        id: 'ASSOCIATION',
        label: 'Association',
        code: 'B2A',
        description: 'Association, fondation ou organisme associatif',
    }),

    ETAT: Object.freeze({
        id: 'ETAT',
        label: 'État',
        code: 'B2G',
        description: 'Services de l’État, collectivités territoriales ou établissements publics',
    }),
});

/**
 * Cycle de vie commercial du compte client
 */
export const CLIENT_STATUS = Object.freeze({
    PROSPECT: {
        id: 'prospect',
        label: 'Prospect',
        isProspect: true,
        color: '#d97706',
        description: 'Compte en phase de prospection ou négociation commerciale sans mission active',
    },
    ACTIF: {
        id: 'actif',
        label: 'Client Actif',
        isProspect: false,
        color: '#16a34a',
        description: 'Client avec contrat cadre, bon de commande ou missions planifiées',
    },
    PAUSE: {
        id: 'pause',
        label: 'En pause',
        isProspect: false,
        color: '#64748b',
        description: 'Prestations temporairement suspendues',
    },
    LITIGE: {
        id: 'litige',
        label: 'Litige / Impayé',
        isProspect: false,
        color: '#dc2626',
        description: 'Contentieux commercial ou incident de paiement bloquant les nouvelles affectations',
    },
    RESILIE: {
        id: 'resilie',
        label: 'Résilié',
        isProspect: false,
        color: '#475569',
        description: 'Contrat clôturé et archivé',
    },
});

/**
 * Ordre canonique du cycle de vie client pour le Pipeline Tactique (4 jalons réels)
 */
export const CLIENT_STATUS_ORDER = Object.freeze([
    'prospect',
    'actif',
    'pause',
    'resilie'
]);

/**
 * Niveaux de gravité des alertes et litiges transversaux du compte
 */
export const CLIENT_RISK_LEVELS = Object.freeze({
    MINEUR: Object.freeze({
        id: 'MINEUR',
        label: 'Mineur',
        color: '#f59e0b',
        impact: 'Avertissement visuel · Aucune restriction de planning'
    }),
    MAJEUR: Object.freeze({
        id: 'MAJEUR',
        label: 'Majeur',
        color: '#f97316',
        impact: 'Avertissement planificateur · Confirmation explicite requise'
    }),
    BLOQUANT: Object.freeze({
        id: 'BLOQUANT',
        label: 'Bloquant',
        color: '#dc2626',
        impact: 'Blocage des nouvelles affectations · Maintien des vacations en cours'
    })
});

/**
 * Matrice des transitions autorisées de la FSM (Cycle de vie opérationnel)
 */
export const CLIENT_STATUS_TRANSITIONS = Object.freeze({
    prospect: Object.freeze(['actif', 'resilie']),
    actif: Object.freeze(['pause', 'resilie']),
    pause: Object.freeze(['actif', 'resilie']),
    resilie: Object.freeze(['actif'])
});

/**
 * Valide si une transition de statut est autorisée par la FSM
 * @param {string} fromStatus 
 * @param {string} toStatus 
 * @returns {boolean}
 */
export function canTransitionClientStatus(fromStatus, toStatus) {
    if (!fromStatus || !toStatus) return false;
    const f = String(fromStatus).toLowerCase();
    const t = String(toStatus).toLowerCase();
    if (f === t) return true;
    const allowed = CLIENT_STATUS_TRANSITIONS[f];
    return Array.isArray(allowed) && allowed.includes(t);
}

/**
 * Détermine si une transition exige obligatoirement un motif justificatif
 * @param {string} toStatus 
 * @returns {boolean}
 */
export function isStatusReasonRequired(toStatus) {
    const t = String(toStatus || '').toLowerCase();
    return t === 'pause' || t === 'resilie';
}

/**
 * Extrait l'identifiant de type soit depuis une chaîne, soit depuis un objet client
 * @param {string|object} clientOrTypeId
 * @returns {string}
 */
function extractTypeId(clientOrTypeId) {
    if (!clientOrTypeId) return '';
    if (typeof clientOrTypeId === 'object') {
        return clientOrTypeId.typeClient || clientOrTypeId.type || clientOrTypeId.id || '';
    }
    return String(clientOrTypeId);
}

/**
 * Retourne la typologie client à partir de son identifiant ou d'un objet client
 * @param {string|object} clientOrTypeId
 * @returns {object}
 */
export function getClientType(clientOrTypeId) {
    const rawId = extractTypeId(clientOrTypeId);
    if (!rawId) return CLIENT_TYPES.ENTREPRISE;
    const normalized = rawId.toUpperCase();
    return CLIENT_TYPES[normalized] || CLIENT_TYPES.ENTREPRISE;
}

/**
 * Indique si le client est une personne physique
 * @param {string|object} clientOrTypeId
 * @returns {boolean}
 */
export function isClientParticulier(clientOrTypeId) {
    return extractTypeId(clientOrTypeId).toUpperCase() === 'PARTICULIER';
}

/**
 * Indique si le client est un service de l'État ou une collectivité assujettie à Chorus Pro
 * @param {string|object} clientOrTypeId
 * @returns {boolean}
 */
export function isClientEtat(clientOrTypeId) {
    const type = extractTypeId(clientOrTypeId).toUpperCase();
    return type === 'ETAT' || type === 'ADMINISTRATION' || type === 'ADMINISTRATION_PUBLIQUE';
}

export const isEtat = isClientEtat;
export const isAdministration = isClientEtat;
export const isAdministrationPublique = isClientEtat;

/**
 * Indique si le client est une association
 * @param {string|object} clientOrTypeId
 * @returns {boolean}
 */
export function isAssociationClient(clientOrTypeId) {
    return extractTypeId(clientOrTypeId).toUpperCase() === 'ASSOCIATION';
}

/**
 * Retourne la configuration de statut client à partir de son identifiant
 * @param {string|object} clientOrStatusId
 * @returns {object}
 */
export function getClientStatus(clientOrStatusId) {
    if (!clientOrStatusId) return CLIENT_STATUS.PROSPECT;
    const rawId = typeof clientOrStatusId === 'object' 
        ? (clientOrStatusId.statut || clientOrStatusId.status || clientOrStatusId.id || 'prospect')
        : String(clientOrStatusId);
    const key = rawId.toUpperCase();
    return CLIENT_STATUS[key] || CLIENT_STATUS.PROSPECT;
}

