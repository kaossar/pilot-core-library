import { describe, it, expect } from 'vitest';
import {
    LEGAL_RELATIONSHIPS,
    CONTRACT_FRAMEWORKS,
    RH_LIFECYCLE_STAGES,
    OPERATIONAL_AVAILABILITY,
    EMERGENCY_MOBILIZATION_STATUS,
    REST_REGULATION_MODES,
    REGULATORY_ACTIVITY_SCOPES,
    isCnapsMandatory,
    isLifecycleStagePlanifiable,
    getAllowedContractFrameworks
} from './collaboratorEnums.js';

describe('Référentiel Collaborateurs Découplé & Multi-Secteurs (collaboratorEnums.js)', () => {

    describe('1. Relations Juridiques & Obligations Légales (RUP / Paie)', () => {
        it('identifie les salariés directs avec paie interne et RUP obligatoire', () => {
            const direct = LEGAL_RELATIONSHIPS.DIRECT_EMPLOYEE;
            expect(direct.requiresPayroll).toBe(true);
            expect(direct.requiresRup).toBe(true);
            expect(direct.rupSection).toBe('SALARIES_DIRECTS');
        });

        it('identifie les intérimaires sans paie interne mais avec mention obligatoire au RUP (Art. L1221-13)', () => {
            const interim = LEGAL_RELATIONSHIPS.TEMPORARY_WORKER;
            expect(interim.requiresPayroll).toBe(false);
            expect(interim.requiresRup).toBe(true);
            expect(interim.rupSection).toBe('SALARIES_TEMPORAIRES');
        });

        it('identifie les sous-traitants et indépendants hors RUP de l\'agence utilisatrice', () => {
            expect(LEGAL_RELATIONSHIPS.SUBCONTRACTOR_WORKER.requiresRup).toBe(false);
            expect(LEGAL_RELATIONSHIPS.INDEPENDENT_CONTRACTOR.requiresRup).toBe(false);
        });
    });

    describe('2. Cadres Contractuels & Relations Autorisées', () => {
        it('associe CDI, CDD et CDDU exclusivement aux salariés directs', () => {
            expect(getAllowedContractFrameworks('DIRECT_EMPLOYEE')).toEqual(
                expect.arrayContaining(['CDI', 'CDD', 'CDDU', 'APPRENTICESHIP'])
            );
        });

        it('associe le contrat de mise à disposition exclusivement aux intérimaires', () => {
            expect(getAllowedContractFrameworks('TEMPORARY_WORKER')).toEqual(['TEMPORARY_ASSIGNMENT']);
        });

        it('associe la convention de sous-traitance exclusivement aux sous-traitants', () => {
            expect(getAllowedContractFrameworks('SUBCONTRACTOR_WORKER')).toEqual(['SUBCONTRACTING_AGREEMENT']);
        });
    });

    describe('3. Cycle de Vie RH & Protection Anti-Affectation Illicite', () => {
        it('interdit formellement la planification des candidats du vivier', () => {
            expect(isLifecycleStagePlanifiable('CANDIDATE')).toBe(false);
            expect(RH_LIFECYCLE_STAGES.CANDIDATE.isPlanifiable).toBe(false);
        });

        it('interdit la planification des profils en cours d\'onboarding ou sortis', () => {
            expect(isLifecycleStagePlanifiable('ONBOARDING')).toBe(false);
            expect(isLifecycleStagePlanifiable('OFFBOARDED')).toBe(false);
            expect(isLifecycleStagePlanifiable('SUSPENDED')).toBe(false);
        });

        it('autorise le principe d\'éligibilité uniquement pour le dossier administratif actif (REGISTERED)', () => {
            expect(isLifecycleStagePlanifiable('REGISTERED')).toBe(true);
        });
    });

    describe('4. Conditionnalité des Contrôles Réglementaires (Multi-Secteurs)', () => {
        it('exige la carte professionnelle CNAPS pour la sécurité privée et la surveillance cynophile', () => {
            expect(isCnapsMandatory('SECURITY_PRIVATE')).toBe(true);
            expect(isCnapsMandatory('CYNOPHILE')).toBe(true);
        });

        it('n\'exige PAS la carte CNAPS pour l\'accueil & hospitalité (IDCC 2098)', () => {
            expect(isCnapsMandatory('RECEPTION_HOSPITALITY')).toBe(false);
        });

        it('n\'exige PAS la carte CNAPS pour la propreté ou les fonctions administratives', () => {
            expect(isCnapsMandatory('CLEANING_FACILITY')).toBe(false);
            expect(isCnapsMandatory('ADMINISTRATIVE')).toBe(false);
        });
    });

    describe('5. Règles de Repos & Dérogations Configurables', () => {
        it('définit le régime légal standard à 11h de repos quotidien et 35h hebdomadaire', () => {
            const standard = REST_REGULATION_MODES.LEGAL_STANDARD;
            expect(standard.minDailyRestHours).toBe(11);
            expect(standard.minWeeklyRestHours).toBe(35);
            expect(standard.requiresCompensatoryRest).toBe(false);
        });

        it('gère les dérogations pour surcroît ou urgence à 9h avec repos compensateur obligatoire', () => {
            const derogation = REST_REGULATION_MODES.DEROGATION_URGENCY;
            expect(derogation.minDailyRestHours).toBe(9);
            expect(derogation.requiresCompensatoryRest).toBe(true);
        });
    });

    describe('6. Machine d\'état Mobilisation d\'Urgence', () => {
        it('couvre les 5 états de sollicitation du pool d\'urgence', () => {
            expect(EMERGENCY_MOBILIZATION_STATUS.REGISTERED_POOL).toBeDefined();
            expect(EMERGENCY_MOBILIZATION_STATUS.SOLICITED).toBeDefined();
            expect(EMERGENCY_MOBILIZATION_STATUS.CONFIRMED).toBeDefined();
            expect(EMERGENCY_MOBILIZATION_STATUS.DECLINED).toBeDefined();
            expect(EMERGENCY_MOBILIZATION_STATUS.UNRESPONSIVE).toBeDefined();
        });
    });
});
