/**
 * labels.test.js — Rôles d'affectation et libellés de qualification (source unique)
 * (exécuté via `node src/constants/labels.test.js`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AFFECTATION_ROLES,
    AFFECTATION_ROLE_LABELS,
    SELECTABLE_AFFECTATION_ROLES,
    getAffectationRoleLabel
} from './affectationRoles.js';
import { getQualificationLabel } from './qualificationLabels.js';

test('chaque rôle d\'affectation possède un libellé', () => {
    for (const role of Object.values(AFFECTATION_ROLES)) {
        assert.ok(AFFECTATION_ROLE_LABELS[role], `Libellé manquant pour ${role}`);
    }
});

test('les rôles proposables sont un sous-ensemble des rôles d\'affectation', () => {
    for (const role of SELECTABLE_AFFECTATION_ROLES) {
        assert.ok(Object.values(AFFECTATION_ROLES).includes(role));
    }
});

test('getAffectationRoleLabel : défaut « Agent », inconnu renvoyé tel quel', () => {
    assert.equal(getAffectationRoleLabel(null), 'Agent');
    assert.equal(getAffectationRoleLabel('CHEF_POSTE'), 'Chef de poste');
    assert.equal(getAffectationRoleLabel('SST'), 'Agent + SST');
    assert.equal(getAffectationRoleLabel('AUTRE'), 'AUTRE');
});

test('getQualificationLabel : historique, référentiel IDCC, inconnu et vide', () => {
    assert.equal(getQualificationLabel('ssiap_2'), 'SSIAP 2');
    assert.equal(getQualificationLabel('ads_confirme'), 'Agent de sécurité confirmé');
    assert.equal(getQualificationLabel('ads_qualifie'), 'Agent de sécurité qualifié');
    assert.equal(getQualificationLabel('inconnue'), 'inconnue');
    assert.equal(getQualificationLabel(undefined, 'Agent'), 'Agent');
});
