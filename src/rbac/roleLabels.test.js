/**
 * roleLabels.test.js — Garantit que la table des libellés de rôles est complète et unique
 * (exécuté via `node src/rbac/roleLabels.test.js`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, ROLE_LABELS, getRoleLabel } from './matrix.js';

test('chaque rôle de l\'enum ROLES possède un libellé', () => {
    for (const role of Object.values(ROLES)) {
        assert.ok(ROLE_LABELS[role], `Libellé manquant pour le rôle ${role}`);
    }
});

test('getRoleLabel : libellé connu, casse tolérée', () => {
    assert.equal(getRoleLabel('ADMIN'), 'Administrateur');
    assert.equal(getRoleLabel('admin'), 'Administrateur');
});

test('getRoleLabel : rôle inconnu renvoyé tel quel, absence de rôle = « Membre »', () => {
    assert.equal(getRoleLabel('ROLE_INCONNU'), 'ROLE_INCONNU');
    assert.equal(getRoleLabel(null), 'Membre');
    assert.equal(getRoleLabel(undefined), 'Membre');
});
