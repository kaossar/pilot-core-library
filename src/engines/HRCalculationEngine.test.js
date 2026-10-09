/**
 * HRCalculationEngine.test.js — Suite de tests unitaires pour le moteur central RH & Prépaie
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { HRCalculationEngine } from './HRCalculationEngine.js';

test('HRCalculationEngine — Cas 1 : Agent Coef 140 avec vacation standard de jour', () => {
    const engine = new HRCalculationEngine();

    const agent = { id: 'agent-1', firstName: 'Jean', lastName: 'Dupont' };
    const contract = {
        id: 'contract-1',
        coefficient: 140,
        salary: 1965.78,
        salaryUnit: 'MOIS',
        status: 'SIGNE'
    };

    // Vacation Lundi 15 juin 2026 de 08:00 à 16:00 (8h)
    const shifts = [
        {
            id: 'shift-1',
            startTime: '2026-06-15T08:00:00Z',
            endTime: '2026-06-15T16:00:00Z',
            status: 'TERMINEE'
        }
    ];

    const result = engine.calculatePayroll({
        agent,
        contract,
        shifts,
        period: { start: '2026-06-01', end: '2026-06-30' }
    });

    const p = result.payrollData;
    assert.equal(p.servicesCount, 1);
    assert.equal(p.totalHours, '8.00');
    assert.equal(p.dayHours, '8.00');
    assert.equal(p.nightHours, '0.00');
    assert.equal(p.sundayDayHours, '0.00');
    assert.equal(p.basketCount, 1); // 8h >= 6h
    assert.equal(p.basketAmount, '4.48');
    assert.equal(p.dressingAmount, '8.78');

    // Base : 8h x 12.9609 € ~= 103.69 € + 8.78 € tenue = 112.47 €
    assert.ok(parseFloat(p.totalGrossAmount) > 100);
});

test('HRCalculationEngine — Cas 2 : Vacation Samedi soir vers Dimanche (Nuit + Dimanche)', () => {
    const engine = new HRCalculationEngine();

    const agent = { id: 'agent-2', firstName: 'Marc', lastName: 'Lambert' };
    const contract = {
        id: 'contract-2',
        coefficient: 120, // Min conventionnel 12.42 €/h
        salary: 1883.85,
        salaryUnit: 'MOIS',
        status: 'SIGNE'
    };

    // Samedi 20 juin 2026 20:00 -> Dimanche 21 juin 08:00 (12h)
    // 20h-21h : Samedi Jour (1h)
    // 21h-00h : Samedi Nuit (3h)
    // 00h-06h : Dimanche Nuit (6h)
    // 06h-08h : Dimanche Jour (2h)
    const shifts = [
        {
            id: 'shift-overnight',
            startTime: '2026-06-20T20:00:00',
            endTime: '2026-06-21T08:00:00',
            status: 'TERMINEE'
        }
    ];

    const result = engine.calculatePayroll({
        agent,
        contract,
        shifts,
        period: { start: '2026-06-01', end: '2026-06-30' }
    });

    const p = result.payrollData;
    assert.equal(p.totalHours, '12.00');
    assert.equal(p.dayHours, '1.00');
    assert.equal(p.nightHours, '3.00');
    assert.equal(p.sundayNightHours, '6.00');
    assert.equal(p.sundayDayHours, '2.00');

    // Nuit totale = 3 + 6 = 9h
    // Dimanche total = 6 + 2 = 8h
    // Vérification des variables créées
    const varNuit = result.variables.find(v => v.type === 'MAJ_NUIT');
    assert.ok(varNuit);
    // 9h x 12.42 x 10% = 11.18 €
    assert.equal(varNuit.amount, 11.18);

    const varDimanche = result.variables.find(v => v.type === 'MAJ_DIMANCHE');
    assert.ok(varDimanche);
    // 8h x 12.42 x 10% = 9.94 €
    assert.equal(varDimanche.amount, 9.94);
});

test('HRCalculationEngine — Cas 3 : Travail le 1er Mai (Majoration 100% ordre public)', () => {
    const engine = new HRCalculationEngine();

    const agent = { id: 'agent-3', firstName: 'Sophie', lastName: 'Bernard' };
    const contract = {
        id: 'contract-3',
        coefficient: 140,
        salary: 15.00, // Salaire effectif supérieur au conventionnel (15 €/h)
        salaryUnit: 'HEURE',
        status: 'SIGNE'
    };

    // Vendredi 1er mai 2026 de 08:00 à 18:00 (10h)
    const shifts = [
        {
            id: 'shift-may1',
            startTime: '2026-05-01T08:00:00Z',
            endTime: '2026-05-01T18:00:00Z',
            status: 'TERMINEE'
        }
    ];

    const result = engine.calculatePayroll({
        agent,
        contract,
        shifts,
        period: { start: '2026-05-01', end: '2026-05-31' }
    });

    const varMayFirst = result.variables.find(v => v.type === 'MAJ_1ER_MAI');
    assert.ok(varMayFirst);
    // 10h x 15.00 € x 100% = 150.00 €
    assert.equal(varMayFirst.amount, 150.00);
});

test('HRCalculationEngine — Cas 4 : Heures supplémentaires hebdomadaires (semaine de 48h selon Accord IDCC 1351 du 18 mai 1993)', () => {
    const engine = new HRCalculationEngine();

    const agent = { id: 'agent-4', firstName: 'Alain', lastName: 'Moreau' };
    const contract = {
        id: 'contract-4',
        coefficient: 120,
        salary: 12.42,
        salaryUnit: 'HEURE',
        status: 'SIGNE'
    };

    // 4 vacations de 12h dans la même semaine (Lundi, Mardi, Mercredi, Jeudi) = 48h
    const shifts = [
        { id: 's1', startTime: '2026-06-08T08:00:00Z', endTime: '2026-06-08T20:00:00Z', status: 'TERMINEE' },
        { id: 's2', startTime: '2026-06-09T08:00:00Z', endTime: '2026-06-09T20:00:00Z', status: 'TERMINEE' },
        { id: 's3', startTime: '2026-06-10T08:00:00Z', endTime: '2026-06-10T20:00:00Z', status: 'TERMINEE' },
        { id: 's4', startTime: '2026-06-11T08:00:00Z', endTime: '2026-06-11T20:00:00Z', status: 'TERMINEE' },
    ];

    const result = engine.calculatePayroll({
        agent,
        contract,
        shifts,
        period: { start: '2026-06-01', end: '2026-06-30' }
    });

    const p = result.payrollData;
    assert.equal(p.totalHours, '48.00');
    // Selon l'accord de branche IDCC 1351 du 18 mai 1993 :
    // 48h - 35h = 13h supplémentaires au total
    // De 36e à 47e (12h) = 25% conventionnel
    // Au-delà de 47e (la 48e heure = 1h) = 50% conventionnel
    assert.equal(p.overtimeHours25, '12.00');
    assert.equal(p.overtimeHours50, '1.00');

    const varHs25 = result.variables.find(v => v.type === 'HEURES_SUP_25');
    assert.ok(varHs25);
    // 12h x 12.42 x 25% = 37.26 €
    assert.equal(varHs25.amount, 37.26);

    const varHs50 = result.variables.find(v => v.type === 'HEURES_SUP_50');
    assert.ok(varHs50);
    // 1h x 12.42 x 50% = 6.21 €
    assert.equal(varHs50.amount, 6.21);
});

test('HRCalculationEngine — Cas 5 : Agent cynophile avec prime de chien', () => {
    const engine = new HRCalculationEngine();

    const agent = { id: 'agent-5', firstName: 'Karim', lastName: 'Cyno' };
    const contract = {
        id: 'contract-5',
        coefficient: 140,
        salary: 12.96,
        salaryUnit: 'HEURE',
        status: 'SIGNE'
    };

    // 2 vacations de 10h avec chien sur 2 jours distincts = 20h cyno
    const shifts = [
        { id: 'c1', startTime: '2026-06-01T08:00:00Z', endTime: '2026-06-01T18:00:00Z', hasDog: true, status: 'TERMINEE' },
        { id: 'c2', startTime: '2026-06-02T08:00:00Z', endTime: '2026-06-02T18:00:00Z', hasDog: true, status: 'TERMINEE' },
    ];

    const result = engine.calculatePayroll({
        agent,
        contract,
        shifts,
        period: { start: '2026-06-01', end: '2026-06-30' }
    });

    const p = result.payrollData;
    assert.equal(p.dogHandlerHours, '20.00');
    // 20h x 1.41 € = 28.20 €
    assert.equal(p.dogHandlerAmount, '28.20');
    assert.equal(p.basketCount, 2);
    // 2 paniers x 4.48 € = 8.96 €
    assert.equal(p.basketAmount, '8.96');
});

test('HRCalculationEngine — Cas 6 : Prime d\'ancienneté conventionnelle (IDCC 1351 Art. 9.03)', () => {
    const engine = new HRCalculationEngine();

    // Agent avec 8 ans d'ancienneté (embauche le 01/01/2018 pour une paie de juin 2026)
    // Taux conventionnel : > 7 ans = 5%
    const agent = { 
        id: 'agent-senior', 
        firstName: 'Fatou', 
        lastName: 'Diallo',
        entryDate: '2018-01-01' 
    };
    const contract = {
        id: 'contract-senior',
        coefficient: 140, // Min conventionnel 12.96 €/h
        salary: 1965.78,
        salaryUnit: 'MOIS',
        status: 'SIGNE'
    };

    // 10 vacations de 7h = 70h travaillées
    const shifts = [];
    for (let day = 1; day <= 10; day++) {
        const dStr = String(day).padStart(2, '0');
        shifts.push({
            id: `sh-${day}`,
            startTime: `2026-06-${dStr}T08:00:00Z`,
            endTime: `2026-06-${dStr}T15:00:00Z`,
            status: 'TERMINEE'
        });
    }

    const result = engine.calculatePayroll({
        agent,
        contract,
        shifts,
        period: { start: '2026-06-01', end: '2026-06-30' }
    });

    const varAnciennete = result.variables.find(v => v.type === 'PRIME_ANCIENNETE');
    assert.ok(varAnciennete, 'La prime d\'ancienneté doit être générée');
    // 70h x 12.96 € (min conv) x 5% = 45.36 €
    assert.equal(varAnciennete.amount, 45.36);
});

test('HRCalculationEngine — Cas 7 : Panier repas journalier (1 panier max par jour calendaire)', () => {
    const engine = new HRCalculationEngine();

    const agent = { id: 'agent-basket', firstName: 'Lucas', lastName: 'Roux' };
    const contract = {
        id: 'contract-basket',
        coefficient: 120,
        salary: 12.42,
        salaryUnit: 'HEURE',
        status: 'SIGNE'
    };

    // Jour 1 (15 juin) : Deux vacations fractionnées de 3h (08h-11h et 14h-17h = 6h) -> 1 panier repas
    // Jour 2 (16 juin) : Une vacation de 12h (08h-20h) -> 1 seul panier repas
    // Total attendu : 2 paniers (et non 3)
    const shifts = [
        { id: 'f1', startTime: '2026-06-15T08:00:00Z', endTime: '2026-06-15T11:00:00Z', status: 'TERMINEE' },
        { id: 'f2', startTime: '2026-06-15T14:00:00Z', endTime: '2026-06-15T17:00:00Z', status: 'TERMINEE' },
        { id: 'f3', startTime: '2026-06-16T08:00:00Z', endTime: '2026-06-16T20:00:00Z', status: 'TERMINEE' },
    ];

    const result = engine.calculatePayroll({
        agent,
        contract,
        shifts,
        period: { start: '2026-06-01', end: '2026-06-30' }
    });

    const p = result.payrollData;
    assert.equal(p.totalHours, '18.00');
    assert.equal(p.basketCount, 2, 'Il doit y avoir exactement 2 paniers (1 par jour civil éligible)');
    assert.equal(p.basketAmount, '8.96');
});
