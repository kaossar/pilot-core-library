export const ROLES = {
    PLANIFICATEUR: 'PLANIFICATEUR',
    DEVISEUR: 'DEVISEUR',
    COMPTABLE: 'COMPTABLE',
    AGENT: 'AGENT',
    CHEF_EQUIPE: 'CHEF_EQUIPE',
    RESPONSABLE_RH: 'RESPONSABLE_RH',
    INSPECTEUR: 'INSPECTEUR',
    RECRUTEUR: 'RECRUTEUR',
    COORDINATEUR: 'COORDINATEUR',
    OPERATEUR_SAISIE: 'OPERATEUR_SAISIE',
    ASSISTANT_DIRECTION: 'ASSISTANT_DIRECTION',
    ADMIN: 'ADMIN',
    OWNER: 'OWNER',
    PLATFORM_ADMIN: 'PLATFORM_ADMIN'
};

export const SCOPES = {
    NONE: 'NONE',
    OWN: 'OWN',
    TEAM: 'TEAM',
    AGENCY: 'AGENCY',
};

export const ACTIONS = {
    CREATE: 'CREATE',
    READ: 'READ',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    VALIDATE: 'VALIDATE',
    SIGN: 'SIGN',
    TERMINATE: 'TERMINATE',
    VIEW_ANALYTICS: 'VIEW_ANALYTICS',
    REPORT: 'REPORT',
    EXPORT: 'EXPORT'
};

export const MODULES = {
    PLANNING: 'PLANNING',
    MISSIONS: 'MISSIONS',
    CLIENTS: 'CLIENTS',
    SITES: 'SITES',
    DEVIS: 'DEVIS',
    BONS_COMMANDE: 'BONS_COMMANDE',
    FACTURES: 'FACTURES',
    CONTRACTS: 'CONTRACTS',
    AGENTS: 'AGENTS',
    PAYROLL: 'PAYROLL',
    USERS: 'USERS',
    AGENCY: 'AGENCY',
    INCIDENTS: 'INCIDENTS',
    AUDIT: 'AUDIT',
    REPORTS: 'REPORTS',
    SETTINGS: 'SETTINGS'
};

// Matrice RBAC centralisée et typée via les constantes
export const RBAC_MATRIX = {
    [ROLES.PLANIFICATEUR]: {
        [MODULES.PLANNING]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY, [ACTIONS.DELETE]: SCOPES.AGENCY, [ACTIONS.EXPORT]: SCOPES.AGENCY },
        [MODULES.MISSIONS]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY, [ACTIONS.VALIDATE]: SCOPES.AGENCY },
        [MODULES.AGENTS]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.SITES]: { [ACTIONS.READ]: SCOPES.AGENCY }
    },
    [ROLES.DEVISEUR]: {
        [MODULES.CLIENTS]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY, [ACTIONS.DELETE]: SCOPES.AGENCY },
        [MODULES.SITES]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY, [ACTIONS.DELETE]: SCOPES.AGENCY },
        [MODULES.DEVIS]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY, [ACTIONS.DELETE]: SCOPES.AGENCY, [ACTIONS.VALIDATE]: SCOPES.AGENCY },
        [MODULES.MISSIONS]: { [ACTIONS.READ]: SCOPES.AGENCY }
    },
    [ROLES.COMPTABLE]: {
        [MODULES.FACTURES]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY, [ACTIONS.EXPORT]: SCOPES.AGENCY },
        [MODULES.PAYROLL]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY, [ACTIONS.EXPORT]: SCOPES.AGENCY },
        [MODULES.CONTRACTS]: { [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.VIEW_ANALYTICS]: SCOPES.AGENCY },
        [MODULES.DEVIS]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.BONS_COMMANDE]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.AGENTS]: { [ACTIONS.READ]: SCOPES.AGENCY }
    },
    [ROLES.AGENT]: {
        [MODULES.MISSIONS]: { [ACTIONS.READ]: SCOPES.OWN, [ACTIONS.UPDATE]: SCOPES.OWN, [ACTIONS.VALIDATE]: SCOPES.OWN },
        [MODULES.PLANNING]: { [ACTIONS.READ]: SCOPES.OWN }
    },
    [ROLES.CHEF_EQUIPE]: {
        [MODULES.MISSIONS]: { [ACTIONS.READ]: SCOPES.TEAM, [ACTIONS.UPDATE]: SCOPES.TEAM, [ACTIONS.VALIDATE]: SCOPES.TEAM },
        [MODULES.PLANNING]: { [ACTIONS.READ]: SCOPES.TEAM },
        [MODULES.AGENTS]: { [ACTIONS.READ]: SCOPES.TEAM }
    },
    [ROLES.RESPONSABLE_RH]: {
        [MODULES.AGENTS]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY, [ACTIONS.DELETE]: SCOPES.AGENCY },
        [MODULES.CONTRACTS]: { 
            [ACTIONS.CREATE]: SCOPES.AGENCY, 
            [ACTIONS.READ]: SCOPES.AGENCY, 
            [ACTIONS.UPDATE]: SCOPES.AGENCY, 
            [ACTIONS.DELETE]: SCOPES.AGENCY,
            [ACTIONS.SIGN]: SCOPES.AGENCY,
            [ACTIONS.TERMINATE]: SCOPES.AGENCY,
            [ACTIONS.VIEW_ANALYTICS]: SCOPES.AGENCY
        },
        [MODULES.PAYROLL]: { [ACTIONS.READ]: SCOPES.AGENCY }
    },
    [ROLES.INSPECTEUR]: {
        [MODULES.MISSIONS]: { [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.VALIDATE]: SCOPES.AGENCY },
        [MODULES.AGENTS]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.PLANNING]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.SITES]: { [ACTIONS.READ]: SCOPES.AGENCY }
    },
    [ROLES.RECRUTEUR]: {
        [MODULES.AGENTS]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY },
        [MODULES.CONTRACTS]: { [ACTIONS.READ]: SCOPES.AGENCY }
    },
    [ROLES.COORDINATEUR]: {
        [MODULES.MISSIONS]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.BONS_COMMANDE]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.PLANNING]: { [ACTIONS.READ]: SCOPES.AGENCY }
    },
    [ROLES.OPERATEUR_SAISIE]: {
        [MODULES.AGENTS]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY },
        [MODULES.SITES]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY },
        [MODULES.CLIENTS]: { [ACTIONS.CREATE]: SCOPES.AGENCY, [ACTIONS.READ]: SCOPES.AGENCY, [ACTIONS.UPDATE]: SCOPES.AGENCY }
    },
    [ROLES.ASSISTANT_DIRECTION]: {
        [MODULES.MISSIONS]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.PLANNING]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.CLIENTS]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.SITES]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.DEVIS]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.BONS_COMMANDE]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.FACTURES]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.CONTRACTS]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.AGENTS]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.PAYROLL]: { [ACTIONS.READ]: SCOPES.AGENCY },
        [MODULES.USERS]: { [ACTIONS.READ]: SCOPES.AGENCY }
    },
    [ROLES.ADMIN]: { /* Full Access via getPermissionScope */ },
    [ROLES.OWNER]: { /* Full Access via getPermissionScope */ }
};

export const ROLE_DESCRIPTIONS = {
    [ROLES.PLANIFICATEUR]: "Gestion des plannings et agents",
    [ROLES.DEVISEUR]: "Gestion commerciale et devis",
    [ROLES.COMPTABLE]: "Gestion financière et paie",
    [ROLES.AGENT]: "Collaborateur de terrain",
    [ROLES.CHEF_EQUIPE]: "Responsable d'équipe locale",
    [ROLES.RESPONSABLE_RH]: "Pilotage des ressources humaines",
    [ROLES.INSPECTEUR]: "Contrôle qualité et sites",
    [ROLES.RECRUTEUR]: "Acquisition de talents",
    [ROLES.COORDINATEUR]: "Coordination opérationnelle",
    [ROLES.OPERATEUR_SAISIE]: "Saisie administrative de masse",
    [ROLES.ASSISTANT_DIRECTION]: "Support global lecture seule"
};

// 2️⃣ Validation automatique de la matrice au boot
export const validateRBACMatrix = () => {
    Object.entries(RBAC_MATRIX).forEach(([role, modules]) => {
        if (!Object.values(ROLES).includes(role)) {
            console.warn(`RBAC WARNING: Rôle non défini dans l'Enum ROLES : ${role}`);
        }

        Object.entries(modules).forEach(([moduleName, actions]) => {
            if (!Object.values(MODULES).includes(moduleName)) {
                throw new Error(`RBAC ERROR: Module invalide dans la matrice : ${moduleName}`);
            }

            Object.entries(actions).forEach(([action, scope]) => {
                if (!Object.values(ACTIONS).includes(action)) {
                    throw new Error(`RBAC ERROR: Action invalide [${action}] pour le module [${moduleName}]`);
                }
                if (!Object.values(SCOPES).includes(scope)) {
                    throw new Error(`RBAC ERROR: Scope invalide [${scope}] pour l'action [${action}] du module [${moduleName}]`);
                }
            });
        });
    });
};

/**
 * 5️⃣ Optimisation performance : Cache de permissions
 * Stocke les scopes calculés pour éviter les boucle redondantes sur gros volumes
 * Clé : roles:module:action
 */
const permissionCache = new Map();

/**
 * Récupère le scope de permission maximal pour un utilisateur (Multi-Rôle cumulatif)
 */
export const getPermissionScope = (userRoles, moduleName, actionId) => {
    const rolesArray = Array.isArray(userRoles) ? userRoles : [userRoles];

    // Si Plateforme Admin, accès Agency par défaut pour tout (ou Platform scope si défini plus tard)
    if (rolesArray.some(role => [ROLES.ADMIN, ROLES.OWNER, ROLES.PLATFORM_ADMIN].includes(role))) {
        return SCOPES.AGENCY;
    }

    // Gestion du Cache
    const cacheKey = `${rolesArray.sort().join('|')}:${moduleName}:${actionId}`;
    if (permissionCache.has(cacheKey)) {
        return permissionCache.get(cacheKey);
    }

    let maxScope = SCOPES.NONE;
    const scopePriority = { [SCOPES.NONE]: 0, [SCOPES.OWN]: 1, [SCOPES.TEAM]: 2, [SCOPES.AGENCY]: 3 };

    rolesArray.forEach(role => {
        const rolePerms = RBAC_MATRIX[role];
        if (rolePerms && rolePerms[moduleName] && rolePerms[moduleName][actionId]) {
            const currentScope = rolePerms[moduleName][actionId];
            if (scopePriority[currentScope] > scopePriority[maxScope]) {
                maxScope = currentScope;
            }
        }
    });

    permissionCache.set(cacheKey, maxScope);
    return maxScope;
};

/**
 * 3️⃣ Fonction hasPermission (Utilitaire Front/Back)
 */
export const hasPermission = (userRoles, moduleName, actionId) => {
    return getPermissionScope(userRoles, moduleName, actionId) !== SCOPES.NONE;
};

/**
 * 6️⃣ Sécurité avancée : Filtres de Scope pour SQL / Data mapping
 */
export const applyScopeFilter = (scope, user) => {
    if (!user) return null;

    switch (scope) {
        case SCOPES.OWN:
            return { agentId: user.id }; // Ou userId selon le contexte
        case SCOPES.TEAM:
            return { teamId: user.teamId };
        case SCOPES.AGENCY:
            return { agencyId: user.agencyId || user.currentAgencyId };
        default:
            return null;
    }
};
