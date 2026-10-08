import test from 'node:test';
import assert from 'node:assert/strict';
import { 
    CLEANING_PACK, 
    RECEPTION_PACK, 
    FACILITY_PACK, 
    SECURITY_PACK, 
    getIndustryPack, 
    INDUSTRY_PACKS 
} from './index.js';

test('Referentiel des packs sectoriels multidomaines', async (t) => {
    await t.test('Chaque pack possede les identifiants conventionnels et labels requis', () => {
        const packs = [CLEANING_PACK, RECEPTION_PACK, FACILITY_PACK, SECURITY_PACK];
        for (const p of packs) {
            assert.ok(p.id, 'Chaque pack doit avoir un id');
            assert.ok(p.label, 'Chaque pack doit avoir un label');
            assert.ok(p.idcc, `Le pack ${p.id} doit avoir une reference IDCC`);
            assert.ok(p.conventionLabel, `Le pack ${p.id} doit avoir un conventionLabel`);
            assert.ok(Array.isArray(p.qualifications), `Le pack ${p.id} doit contenir des qualifications`);
            assert.ok(p.qualifications.length > 0, `Le pack ${p.id} doit avoir au moins une qualification`);
            assert.ok(p.defaultRates, `Le pack ${p.id} doit definir defaultRates`);
            assert.ok(p.defaultRates.flatRate, `Le pack ${p.id} doit definir un taux horaire moyen (flatRate)`);
        }
    });

    await t.test('Le pack Proprete (IDCC 3173) definit les clauses et grilles adaptees', () => {
        assert.equal(CLEANING_PACK.idcc, '3173');
        assert.equal(CLEANING_PACK.clausesContrat.tempsPartielModule, true);
        assert.equal(CLEANING_PACK.clausesContrat.reprisePersonnelAnnexe7, true);
        const ash = CLEANING_PACK.qualifications.find(q => q.value === 'ASH');
        assert.ok(ash, 'ASH doit etre present');
        assert.equal(ash.coefficient, 'AS1');
        assert.equal(ash.billingRateSuggested, 23.50);
    });

    await t.test('Le pack Accueil (IDCC 2098) definit les horaires decales et clauses d accueil', () => {
        assert.equal(RECEPTION_PACK.idcc, '2098');
        assert.equal(RECEPTION_PACK.clausesContrat.horairesDecales, true);
        assert.equal(RECEPTION_PACK.clausesContrat.tenueAccueilEntretien, true);
        const hote = RECEPTION_PACK.qualifications.find(q => q.value === 'HOTE_ACCUEIL');
        assert.ok(hote, 'Hote accueil doit etre present');
        assert.equal(hote.coefficient, 'N1');
        assert.equal(hote.billingRateSuggested, 25.00);
    });

    await t.test('Le pack Facility Management definit la polyvalence technique', () => {
        assert.equal(FACILITY_PACK.clausesContrat.polyvalenceTechnique, true);
        assert.equal(FACILITY_PACK.clausesContrat.interventionsMultisites, true);
        const cvc = FACILITY_PACK.qualifications.find(q => q.value === 'TECHNICIEN_CVC');
        assert.ok(cvc, 'Technicien CVC doit etre present');
        assert.equal(cvc.billingRateSuggested, 42.00);
    });

    await t.test('getIndustryPack resout fidelement chaque pack avec repli par defaut', () => {
        assert.equal(getIndustryPack('cleaning').id, 'cleaning');
        assert.equal(getIndustryPack('reception').id, 'reception');
        assert.equal(getIndustryPack('facility').id, 'facility');
        assert.equal(getIndustryPack('security').id, 'security');
        assert.equal(getIndustryPack('inconnu').id, 'security');
        assert.equal(getIndustryPack().id, 'security');
    });
});
