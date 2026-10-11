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
const administrationPublique = Object.freeze({
    id: 'ADMINISTRATION_PUBLIQUE',
    label: 'Administration publique',
    code: 'B2G',
    description: 'Administration, collectivité ou établissement public',
});

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

    ADMINISTRATION_PUBLIQUE: administrationPublique,
    ORGANISME_PUBLIC: administrationPublique,
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
 * Indique si le client est une administration ou organisme public assujetti à Chorus Pro
 * @param {string|object} clientOrTypeId
 * @returns {boolean}
 */
export function isOrganismePublic(clientOrTypeId) {
    const raw = extractTypeId(clientOrTypeId).toUpperCase();
    return raw === 'ADMINISTRATION_PUBLIQUE' || raw === 'ORGANISME_PUBLIC';
}

/**
 * Alias sémantique conforme pour l'Administration publique
 */
export const isAdministrationPublique = isOrganismePublic;

/**
 * Indique si le client est une association
 * @param {string|object} clientOrTypeId
 * @returns {boolean}
 */
export function isAssociationClient(clientOrTypeId) {
    return extractTypeId(clientOrTypeId).toUpperCase() === 'ASSOCIATION';
}

