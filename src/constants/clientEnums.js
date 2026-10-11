/**
 * clientEnums.js - Référentiel des typologies juridiques et statuts clients
 *
 * PILOT OS - Module Gestion Commerciale & CRM
 * Architecture pérenne 10+ ans selon la Clean Architecture et les règles PILOT.
 * Tous les commentaires sont en français.
 */

/**
 * Typologies juridiques des clients de sécurité privée
 */
export const CLIENT_TYPES = Object.freeze({
    ENTREPRISE: {
        id: 'ENTREPRISE',
        label: 'Entreprise',
        code: 'B2B',
        description: 'Société commerciale, personne morale de droit privé ou entreprise individuelle',
        requiresSiret: true,
        requiresVat: true,
        isMoralPerson: true,
    },
    PARTICULIER: {
        id: 'PARTICULIER',
        label: 'Client Particulier',
        code: 'B2C',
        description: 'Personne physique, client privé (surveillance de villa, protection personnelle, événement privé)',
        requiresSiret: false,
        requiresVat: false,
        isMoralPerson: false,
    },
    ASSOCIATION: {
        id: 'ASSOCIATION',
        label: 'Association',
        code: 'B2A',
        description: 'Association loi 1901, club sportif, fondation ou organisme sans but lucratif',
        requiresSiret: false,
        requiresVat: false,
        isMoralPerson: true,
    },
    ORGANISME_PUBLIC: {
        id: 'ORGANISME_PUBLIC',
        label: 'Organisme Public',
        code: 'B2G',
        description: 'Collectivité territoriale, administration publique, hôpital ou établissement public (Chorus Pro)',
        requiresSiret: true,
        requiresVat: true,
        isMoralPerson: true,
        requiresChorusPro: true,
    },
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
 * Indique si le client est un organisme public assujetti à Chorus Pro
 * @param {string|object} clientOrTypeId
 * @returns {boolean}
 */
export function isOrganismePublic(clientOrTypeId) {
    return extractTypeId(clientOrTypeId).toUpperCase() === 'ORGANISME_PUBLIC';
}

/**
 * Indique si le client est une association
 * @param {string|object} clientOrTypeId
 * @returns {boolean}
 */
export function isAssociationClient(clientOrTypeId) {
    return extractTypeId(clientOrTypeId).toUpperCase() === 'ASSOCIATION';
}

