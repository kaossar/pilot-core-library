/**
 * 4️⃣ Middleware sécurisé (Standard SaaS Enterprise)
 * Pour Express / API.
 * 
 * NOTE: Ce fichier est pré-configuré pour être importé dans le backend
 * tout en utilisant la logique pure de @shared/core/rbac.
 */

import { getPermissionScope, SCOPES } from './matrix.js';

export const requirePermission = (moduleName, actionId) => {
    return (req, res, next) => {
        // Récupération des rôles depuis l'utilisateur injecté par authMiddleware
        const userRoles = req.user?.roles || [];

        // Calcul du scope maximal via le moteur centralisé
        const scope = getPermissionScope(userRoles, moduleName, actionId);

        if (scope === SCOPES.NONE) {
            return res.status(403).json({
                error: 'Permission denied',
                module: moduleName,
                action: actionId,
                message: "Vous n'avez pas les droits nécessaires pour effectuer cette action."
            });
        }

        // Injection du scope dans la requête pour filtrage SQL ultérieur
        req.permissionScope = scope;

        next();
    };
};
