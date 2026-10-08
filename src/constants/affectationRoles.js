/**
 * affectationRoles.js — Rôles d'affectation d'un agent sur une mission (SOURCE UNIQUE)
 *
 * Ne pas confondre avec les rôles utilisateur (rbac/matrix.js → ROLES) : ces valeurs
 * qualifient la fonction tenue PAR UN AGENT sur une mission (colonne `role` de
 * `affectations_missions`). Aucun projet ne doit redéclarer ces valeurs ni leurs libellés.
 */

/** Valeurs persistées dans `affectations_missions.role`. */
export const AFFECTATION_ROLES = Object.freeze({
    AGENT: 'AGENT',
    CHEF_POSTE: 'CHEF_POSTE',
    SST: 'SST'
});

/** Libellés d'affichage des rôles d'affectation. */
export const AFFECTATION_ROLE_LABELS = Object.freeze({
    [AFFECTATION_ROLES.AGENT]: 'Agent',
    [AFFECTATION_ROLES.CHEF_POSTE]: 'Chef de poste',
    [AFFECTATION_ROLES.SST]: 'Agent + SST'
});

/**
 * Rôles proposables lors de la création d'une mission (SST est un statut d'habilitation
 * attribué ailleurs, pas un choix de poste).
 */
export const SELECTABLE_AFFECTATION_ROLES = Object.freeze([
    AFFECTATION_ROLES.AGENT,
    AFFECTATION_ROLES.CHEF_POSTE
]);

/**
 * Libellé d'un rôle d'affectation (« Agent » par défaut, valeur brute si inconnue).
 * @param {string|null|undefined} role
 * @returns {string}
 */
export const getAffectationRoleLabel = (role) => {
    if (!role) return AFFECTATION_ROLE_LABELS[AFFECTATION_ROLES.AGENT];
    return AFFECTATION_ROLE_LABELS[role] ?? role;
};
