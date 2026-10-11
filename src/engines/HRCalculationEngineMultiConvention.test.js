/**
 * HRCalculationEngineMultiConvention.test.js
 * 
 * Tests d'isolation sectorielle et de calcul multi-conventions de PILOT OS.
 * Vérifie formellement le respect du cahier des charges :
 * 1. Zéro contamination entre conventions (IDCC 1351 vs 3173 vs 2098 vs 9999).
 * 2. Application rigoureuse des plages de nuit (21h-06h vs 22h-05h).
 * 3. Application des paliers d'heures sup de chaque branche (35-47h vs 35-43h).
 * 4. Détection et hiérarchisation des anomalies (minima, durées max, repos).
 * 5. Paramètres personnalisés d'entreprise (Niveau B).
 * 
 * Commentaires 100 % en français.
 */

import { describe, it, expect } from 'vitest';
import { HRCalculationEngine } from './HRCalculationEngine.js';
import { ConventionRegistry } from '../rules/ConventionRegistry.js';

describe('HRCalculationEngine — Multi-Conventions & Isolation Sectorielle Stricte', () => {

    it('1. Entreprise de Propreté (IDCC 3173) : Isolation absolue contre les règles de sécurité privée', () => {
        const engine = new HRCalculationEngine();

        const agent = { id: 'agent-cleaning-1', firstName: 'Amina', lastName: 'Benali' };
        const contract = {
            id: 'contract-clean-1',
            coefficient: 'AS1', // Min conv propreté 12.02 €/h
            salary: 1823.03,
            salaryUnit: 'MOIS',
            status: 'SIGNE'
        };

        // Vacation de nuit : 21h00 à 05h00 (8h travaillées en heure locale)
        // En Propreté : la nuit démarre à 22h00 (et non 21h00 comme en sécurité) !
        // De 21h à 22h = 1h jour
        // De 22h à 05h = 7h nuit propreté (+20% sur salaire réel)
        const shifts = [
            {
                id: 'shift-clean-night',
                startTime: '2026-06-15T21:00:00',
                endTime: '2026-06-16T05:00:00',
                status: 'TERMINEE',
                hasDog: true // Tentative de déclarer un chien dans une entreprise de propreté !
            }
        ];

        const result = engine.calculatePayroll({
            agent,
            contract,
            shifts,
            period: { start: '2026-06-01', end: '2026-06-30' },
            agencyConfig: {
                conventionIdcc: '3173',
                industryType: 'cleaning'
            }
        });

        const p = result.payrollData;

        // Vérification des heures : total 8h, 1h jour, 7h nuit (22h-05h)
        expect(p.totalHours).toBe('8.00');
        expect(p.dayHours).toBe('1.00');
        expect(p.nightHours).toBe('7.00');

        // Isolation 1 : ZÉRO prime cynophile (le chien n'existe pas en propreté !)
        expect(p.dogHandlerHours).toBe('0.00');
        expect(p.dogHandlerAmount).toBe('0.00');
        expect(result.variables.find(v => v.type === 'PRIME_CHIEN')).toBeUndefined();

        // Isolation 2 : ZÉRO indemnité tenue sécurité privée 8.78 €
        expect(p.dressingAmount).toBe('0.00');
        expect(result.variables.find(v => v.type === 'INDEMNITE_TENUE_SECURITE')).toBeUndefined();

        // Majoration nuit Propreté : 7h de nuit x 12.02 € x 20% = 16.83 €
        const varNuit = result.variables.find(v => v.type === 'MAJ_NUIT');
        expect(varNuit).toBeDefined();
        expect(varNuit.amount).toBe(16.83);

        // Panier de nuit Propreté (3.80 € car 7h de nuit >= seuil 4h)
        const varPanierNuit = result.variables.find(v => v.type === 'INDEMNITE_PANIER_NUIT');
        expect(varPanierNuit).toBeDefined();
        expect(varPanierNuit.amount).toBe(3.80);

        // Vérification de la trace de convention
        expect(result.calculationTrace.convention.idcc).toBe('3173');
        expect(result.calculationTrace.convention.industry).toBe('cleaning');
    });

    it('2. Entreprise d\'Accueil & Tertiaire (IDCC 2098) : Règles d\'accueil et indemnité tenue spécifique', () => {
        const engine = new HRCalculationEngine();

        const agent = { id: 'agent-reception-1', firstName: 'Sophie', lastName: 'Martin' };
        const contract = {
            id: 'contract-recept-1',
            coefficient: 'N2', // Hôtesse confirmée (12.50 €/h)
            salary: 1895.88,
            salaryUnit: 'MOIS',
            status: 'SIGNE'
        };

        // 3 vacations de jour en semaine (7h chacune = 21h)
        const shifts = [
            { id: 's1', startTime: '2026-06-08T09:00:00Z', endTime: '2026-06-08T16:00:00Z', status: 'TERMINEE' },
            { id: 's2', startTime: '2026-06-09T09:00:00Z', endTime: '2026-06-09T16:00:00Z', status: 'TERMINEE' },
            { id: 's3', startTime: '2026-06-10T09:00:00Z', endTime: '2026-06-10T16:00:00Z', status: 'TERMINEE' }
        ];

        const result = engine.calculatePayroll({
            agent,
            contract,
            shifts,
            period: { start: '2026-06-01', end: '2026-06-30' },
            agencyConfig: {
                conventionIdcc: '2098',
                industryType: 'reception'
            }
        });

        const p = result.payrollData;
        expect(p.totalHours).toBe('21.00');

        // Forfait tenue accueil : 15.00 € / mois (et non 8.78 € de la sécurité !)
        expect(p.dressingAmount).toBe('15.00');
        const varTenue = result.variables.find(v => v.type === 'INDEMNITE_TENUE_ACCUEIL');
        expect(varTenue).toBeDefined();
        expect(varTenue.amount).toBe(15.00);

        // Zéro panier sécurité 4.48 €
        expect(p.basketAmount).toBe('0.00');
        expect(p.basketCount).toBe(0);
    });

    it('3. Différence des tranches d\'heures sup : Sécurité (35h-47h à 25%) vs Droit Commun (35h-43h à 25%)', () => {
        const engine = new HRCalculationEngine();
        const agent = { id: 'agent-hs-1', firstName: 'Paul', lastName: 'Durand' };

        // Semaine complète de 48 heures travaillées
        const shifts48h = [
            { id: 'd1', startTime: '2026-06-08T08:00:00Z', endTime: '2026-06-08T20:00:00Z', status: 'TERMINEE' }, // 12h
            { id: 'd2', startTime: '2026-06-09T08:00:00Z', endTime: '2026-06-09T20:00:00Z', status: 'TERMINEE' }, // 12h
            { id: 'd3', startTime: '2026-06-10T08:00:00Z', endTime: '2026-06-10T20:00:00Z', status: 'TERMINEE' }, // 12h
            { id: 'd4', startTime: '2026-06-11T08:00:00Z', endTime: '2026-06-11T20:00:00Z', status: 'TERMINEE' }  // 12h
        ];

        // Calcul 1 : Sécurité Privée (IDCC 1351) -> Accord 18 mai 1993 : 12 heures supplémentaires à 25% (36e à 47e), puis 1h à 50%
        const resSecu = engine.calculatePayroll({
            agent,
            contract: { id: 'c1', coefficient: 140, salary: 1965.78, status: 'SIGNE' },
            shifts: shifts48h,
            period: { start: '2026-06-01', end: '2026-06-30' },
            agencyConfig: { conventionIdcc: '1351' }
        });

        expect(resSecu.payrollData.overtimeHours25).toBe('12.00');
        expect(resSecu.payrollData.overtimeHours50).toBe('1.00');

        // Calcul 2 : Droit Commun / Code du travail (IDCC 9999) -> 8 heures à 25% (36e à 43e), puis 5 heures à 50% (44e à 48e)
        const resGeneral = engine.calculatePayroll({
            agent,
            contract: { id: 'c2', coefficient: 100, salary: 1823.03, status: 'SIGNE' },
            shifts: shifts48h,
            period: { start: '2026-06-01', end: '2026-06-30' },
            agencyConfig: { conventionIdcc: '9999' }
        });

        expect(resGeneral.payrollData.overtimeHours25).toBe('8.00');
        expect(resGeneral.payrollData.overtimeHours50).toBe('5.00');
    });

    it('4. Détection des anomalies critiques : salaire sous le minimum et repos insuffisant', () => {
        const engine = new HRCalculationEngine();

        const agent = { id: 'agent-ano-1', firstName: 'Lucas', lastName: 'Moreau' };
        // Salaire contractuel de 10.00 €/h -> Inférieur au minimum conventionnel (12.42 €/h)
        const contract = {
            id: 'contract-ano-1',
            coefficient: 120,
            salary: 10.00,
            salaryUnit: 'HEURE',
            status: 'SIGNE'
        };

        // 2 vacations avec seulement 4 heures de repos entre les deux (illégal : repos minimal 11h)
        const shifts = [
            { id: 'v1', startTime: '2026-06-15T08:00:00Z', endTime: '2026-06-15T20:00:00Z', status: 'TERMINEE' },
            { id: 'v2', startTime: '2026-06-16T00:00:00Z', endTime: '2026-06-16T08:00:00Z', status: 'TERMINEE' }
        ];

        const result = engine.calculatePayroll({
            agent,
            contract,
            shifts,
            period: { start: '2026-06-01', end: '2026-06-30' },
            agencyConfig: { conventionIdcc: '1351' }
        });

        // Vérification des anomalies détectées
        expect(result.anomalies.length).toBeGreaterThanOrEqual(2);

        // 1. Anomalie sous-minimum
        const anoMin = result.anomalies.find(a => a.code === 'SOUS_MINIMUM_CONVENTIONNEL');
        expect(anoMin).toBeDefined();
        expect(anoMin.severity).toBe('CRITICAL');
        expect(anoMin.deficit).toBeGreaterThan(2);

        // 2. Anomalie repos
        const anoRepos = result.anomalies.find(a => a.code === 'REPOS_JOURNALIER_INSUFFISANT');
        expect(anoRepos).toBeDefined();
        expect(anoRepos.severity).toBe('MAJOR');

        // Le calcul effectif a rehaussé le salaire au minimum légal/conventionnel (12.42 €)
        expect(result.calculationTrace.ratesSnapshot.effectiveHourlyRate).toBe(12.42);
    });

    it('5. Paramètres d\'entreprise de Niveau B : Accord rehaussant la majoration de nuit et prime personnalisée', () => {
        const engine = new HRCalculationEngine();

        const agent = { id: 'agent-custom-1', firstName: 'Émilie', lastName: 'Roux' };
        const contract = {
            id: 'c-custom-1',
            coefficient: 140,
            salary: 1965.78,
            salaryUnit: 'MOIS',
            status: 'SIGNE'
        };

        const shifts = [
            { id: 'v-nuit', startTime: '2026-06-15T21:00:00', endTime: '2026-06-16T05:00:00', status: 'TERMINEE' } // 8h nuit
        ];

        // Accord d'entreprise rehaussant la nuit de 10% à 25% + Prime assiduité d'entreprise (50 €)
        const customPayrollRules = {
            premiumsOverrides: {
                night: {
                    rate: 0.25,
                    accordRef: "Accord d'entreprise du 12/01/2026 (Majoration Nuit Favorable)"
                }
            },
            additionalAllowances: {
                primeAssiduite: {
                    id: 'PRIME_ASSIDUITE',
                    monthlyAmount: 50.00,
                    label: "Prime d'assiduité mensuelle entreprise"
                }
            }
        };

        const result = engine.calculatePayroll({
            agent,
            contract,
            shifts,
            period: { start: '2026-06-01', end: '2026-06-30' },
            agencyConfig: {
                conventionIdcc: '1351',
                customPayrollRules
            }
        });

        // 8h nuit x 12.96 € (min conv 140) x 25% (accord d'entreprise) = 25.92 €
        const varNuit = result.variables.find(v => v.type === 'MAJ_NUIT');
        expect(varNuit).toBeDefined();
        expect(varNuit.amount).toBe(25.92);
    });

    it('6. Protection anti-salaire farfelu : Contrat à 1850 € avec unité HEURE par défaut est normalisé à 12.96 €/h et base brute réelle de 453.60 € (et non 64 750 €)', () => {
        const engine = new HRCalculationEngine();

        const agent = { id: 'agent-140', firstName: 'Jean', lastName: 'Sécurité' };
        // Simulation exacte du cas réel : salaire contractuel 1850 avec unité par défaut 'HEURE'
        const contract = {
            id: 'c-140',
            coefficient: 140,
            salary: 1850,
            salaryUnit: 'HEURE',
            status: 'SIGNE'
        };

        const shifts = [
            { id: 'v1', startTime: '2026-10-05T06:00:00', endTime: '2026-10-05T14:00:00', status: 'TERMINEE' }, // 8h
            { id: 'v2', startTime: '2026-10-06T06:00:00', endTime: '2026-10-06T14:00:00', status: 'TERMINEE' }, // 8h
            { id: 'v3', startTime: '2026-10-08T06:00:00', endTime: '2026-10-08T14:00:00', status: 'TERMINEE' }, // 8h
            { id: 'v4', startTime: '2026-10-09T06:00:00', endTime: '2026-10-09T17:00:00', status: 'TERMINEE' }  // 11h
        ]; // Total = 35h

        const result = engine.calculatePayroll({
            agent,
            contract,
            shifts,
            period: { start: '2026-10-01', end: '2026-10-31' },
            agencyConfig: { conventionIdcc: '1351' }
        });

        const trace = result.calculationTrace;
        expect(trace.ratesSnapshot.contractHourlyRate).toBeCloseTo(12.1975, 2);
        // Le taux effectif doit être rehaussé au minimum conventionnel du coeff 140 (12.96 €/h)
        expect(trace.ratesSnapshot.effectiveHourlyRate).toBe(12.96);
        expect(trace.ratesSnapshot.isBelowMinimum).toBe(true);

        // La base brute pour 35h doit être 35 * 12.96 = 453.60 € (ET SURTOUT PAS 64 750 €)
        expect(trace.summary.baseGrossAmount).toBe(453.60);
        expect(trace.summary.totalGrossAmount).toBeLessThan(500);
        expect(Number(result.payrollData.totalGrossAmount)).toBeCloseTo(462.38, 1);
    });
});
