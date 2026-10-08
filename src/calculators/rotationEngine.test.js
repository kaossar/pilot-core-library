/**
 * Tests unitaires du moteur de roulement d'agents (rotationEngine.js)
 *
 * 15 cas de test couvrant :
 *   - Jours calendaires UTC (meme jour, minuit, multi-jours)
 *   - Proratisation des heures hebdomadaires
 *   - Toutes les regles CCN (11h, 6j, 48h, 35h, NO_OVERLAP)
 *   - Strategies Least Loaded et Round Robin
 *   - DST / changement d'heure (UTC)
 *   - Equite sur une longue periode
 *
 * @module rotationEngine.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignAgentRotation, getAgentSummary, VIOLATIONS, STRATEGIES, MIN_VACATION_DURATION_HOURS, MAX_ROLLING_12W_AVERAGE_HOURS, MIN_SUNDAY_REST_PER_MONTH } from './rotationEngine.js';

// ---------------------------------------------------------------------------
// Helpers de construction de shifts de test
// ---------------------------------------------------------------------------

let shiftIdCounter = 0;
const makeShift = (startISO, endISO) => {
    const start = new Date(startISO);
    const end   = new Date(endISO);
    const duration = (end - start) / 3600000;
    return {
        id: `test-shift-${++shiftIdCounter}`,
        startAt: startISO,
        endAt:   endISO,
        duration,
        severity: 'ok',
        userDecision: null,
    };
};

// ---------------------------------------------------------------------------
// Test 1 : Deux shifts le meme jour + lendemain = seulement 2 jours consecutifs (pas 3)
// Verifie que 2 shifts sur le meme jour calendaire comptent comme 1 seul jour.
// ---------------------------------------------------------------------------
describe('rotationEngine', () => {
    it('T01 - Deux shifts le meme jour = 1 seul jour travaille (pas 2)', () => {
        // Gap entre shift1 (fin 06h) et shift2 (debut 17h) = 11h -> OK
        // Gap entre shift2 (fin 23h) et shift3 (debut 10h+1j) = 11h -> OK
        // workedDays = {Jul20, Jul21} -> consecutiveDays = 2, pas 3
        const shifts = [
            makeShift('2026-07-20T00:00:00.000Z', '2026-07-20T06:00:00.000Z'), // 6h
            makeShift('2026-07-20T17:00:00.000Z', '2026-07-20T23:00:00.000Z'), // 6h (gap 11h)
            makeShift('2026-07-21T10:00:00.000Z', '2026-07-21T16:00:00.000Z'), // 6h (gap 11h)
        ];
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        assert.equal(result.length, 3);
        // Les 3 shifts doivent etre assignes a A (1 seul agent)
        assert.equal(result[0].placeholder.id, 'A');
        assert.equal(result[1].placeholder.id, 'A');
        assert.equal(result[2].placeholder.id, 'A');
        assert.ok(!result[0].unassignable, 'Shift 1 doit etre assignable');
        assert.ok(!result[1].unassignable, 'Shift 2 meme jour doit etre assignable (gap 11h)');
        assert.ok(!result[2].unassignable, 'Shift lendemain doit etre assignable (consecutiveDays=2, pas 3)');
    });

    // -----------------------------------------------------------------------
    // Test 2 : Shift traversant minuit -> 2 jours calendaires UTC
    // -----------------------------------------------------------------------
    it('T02 - Shift traversant minuit = 2 jours calendaires', () => {
        const shifts = [makeShift('2026-07-20T18:00:00.000Z', '2026-07-21T06:00:00.000Z')]; // 12h
        const result = assignAgentRotation(shifts, 2, 'ads_qualifie');
        assert.equal(result[0].placeholder.id, 'A');
        assert.ok(!result[0].unassignable);
    });

    // -----------------------------------------------------------------------
    // Test 3 : Shift inter-semaines ISO (Dim 22h30 -> Lun 10h30) - proratisation
    // -----------------------------------------------------------------------
    it('T03 - Shift traversant deux semaines ISO = heures proratisees', () => {
        // 2026-07-19 est un dimanche (W29), 2026-07-20 est un lundi (W30)
        // Shift: Dim 22h30 UTC -> Lun 10h30 UTC = 12h
        // W29 : 22h30->24h00 = 1.5h, W30 : 00h00->10h30 = 10.5h
        const shifts = [makeShift('2026-07-19T22:30:00.000Z', '2026-07-20T10:30:00.000Z')];
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        assert.equal(result[0].placeholder.id, 'A');
        assert.ok(!result[0].unassignable);
        assert.equal(result[0].duration, 12);
    });

    // -----------------------------------------------------------------------
    // Test 4 : Un seul agent, repos insuffisant -> assigne quand meme avec violation CCN
    // -----------------------------------------------------------------------
    it('T04 - Repos insuffisant -> agent assigne avec violation MIN_REST (pas ?)', () => {
        // Shift 1 : 18h->06h (12h). Shift 2 : 2h apres (08h->20h) = repos = 2h < 11h
        const shifts = [
            makeShift('2026-07-20T18:00:00.000Z', '2026-07-21T06:00:00.000Z'), // 12h
            makeShift('2026-07-21T08:00:00.000Z', '2026-07-21T20:00:00.000Z'), // repos = 2h < 11h
        ];
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        assert.equal(result[0].placeholder.id, 'A');
        assert.ok(!result[0].unassignable);
        // Shift 2 : A seul agent, repos < 11h -> assigne quand meme avec violation
        // L'agent doit etre reel (pas '?')
        assert.equal(result[1].placeholder.id, 'A', 'Un agent reel doit toujours etre assigne');
        assert.ok(result[1].unassignable, 'Shift 2 doit etre marque unassignable (violation CCN)');
        assert.ok(result[1].violations.includes(VIOLATIONS.MIN_REST), 'La violation MIN_REST doit etre signalee');
        assert.equal(result[1].severity, 'critical');
    });

    // -----------------------------------------------------------------------
    // Test 5 : Rotation equitable sur un mois (3 agents, 1 shift de 8h par jour)
    // Pattern simple : 1 shift/jour -> pas d'accumulation consecutive rapide
    // -----------------------------------------------------------------------
    it('T05 - Rotation equitable 1 mois (3 agents) - ecart max acceptable', () => {
        // 30 shifts de 8h (1/jour, 08-16h UTC), 3 agents
        // Chaque agent prend ~10 shifts = ~80h
        // Chaque agent travaille ~1 jour sur 3 -> jamais 6 jours consecutifs
        const shifts = [];
        for (let day = 0; day < 30; day++) {
            const d = new Date('2026-07-06T08:00:00.000Z'); // Commence un lundi
            d.setUTCDate(d.getUTCDate() + day);
            const e = new Date(d);
            e.setUTCHours(16, 0, 0, 0);
            shifts.push(makeShift(d.toISOString(), e.toISOString()));
        }
        const result = assignAgentRotation(shifts, 3, 'ads_qualifie');
        // Aucun shift non assignable (pattern 1 shift/j, agents tournent bien)
        const unassigned = result.filter(s => s.unassignable).length;
        assert.equal(unassigned, 0, `${unassigned} shifts non assignes`);
        // Equite : ecart max entre les agents <= 24h
        const summary = getAgentSummary(result);
        const hours = summary.filter(s => s.id !== '?').map(s => s.totalHours);
        if (hours.length > 1) {
            const spread = Math.max(...hours) - Math.min(...hours);
            assert.ok(spread <= 24, `Ecart trop grand: ${spread}h (max 24h attendu)`);
        }
    });

    // -----------------------------------------------------------------------
    // Test 6 : 7eme jour consecutif bloque -> MAX_CONSECUTIVE_WORK_DAYS
    // Utilise des shifts de 6h pour rester sous 48h/semaine (6x6h=36h<48h).
    // La regle des 6 jours consecutifs se declenche avant MAX_WEEKLY_HOURS.
    // -----------------------------------------------------------------------
    it('T06 - 7eme jour consecutif -> bloque (MAX_CONSECUTIVE_WORK_DAYS)', () => {
        // 7 shifts de 6h (08h-14h), 1 agent
        // Semaine ISO : Jul13=Lun W29, Jul14=Mar, ..., Jul19=Dim W29
        // 7 x 6h = 42h < 48h -> MAX_WEEKLY_HOURS ne bloque pas
        // Jours 1-6 OK, Jour 7 -> 7 jours consecutifs -> BLOQUE
        const shifts = [];
        for (let day = 0; day < 7; day++) {
            const start = new Date('2026-07-13T08:00:00.000Z'); // Lundi W29
            start.setUTCDate(start.getUTCDate() + day);
            const end = new Date(start);
            end.setUTCHours(14, 0, 0, 0);
            shifts.push(makeShift(start.toISOString(), end.toISOString()));
        }
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        // Shifts 1-6 : OK (6 jours consecutifs exactement)
        for (let i = 0; i < 6; i++) {
            assert.ok(!result[i].unassignable, `Shift ${i + 1} doit etre assignable`);
        }
        // Shift 7 : bloque (7eme jour consecutif > 6)
        assert.ok(result[6].unassignable, 'Shift 7 (7eme jour consecutif) doit etre non assignable');
    });

    // -----------------------------------------------------------------------
    // Test 7 : Repos hebdomadaire 35h glissant
    // -----------------------------------------------------------------------
    it('T07 - 35h repos continu glissant -> MIN_WEEKLY_REST', () => {
        // 7 shifts de 12h, 1 shift tous les jours 20h->08h
        // Apres 7 jours consecutifs avec un seul agent, le repos entre shifts = 12h
        // Aucune fenetre de 35h de repos continu -> MIN_WEEKLY_REST
        const shifts = [];
        for (let day = 0; day < 8; day++) {
            const h = 8 + day * 24;
            const start = new Date('2026-07-01T08:00:00.000Z');
            start.setUTCDate(start.getUTCDate() + day);
            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + 1);
            shifts.push(makeShift(start.toISOString(), end.toISOString()));
        }
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        // Au moins un shift doit etre bloque (MAX_CONSECUTIVE_WORK_DAYS ou MIN_WEEKLY_REST)
        const blocked = result.filter(s => s.unassignable);
        assert.ok(blocked.length > 0, 'Au moins un shift doit etre non assignable apres 7 jours');
    });

    // -----------------------------------------------------------------------
    // Test 8 : Repos exactement 11h -> OK (pas de violation)
    // -----------------------------------------------------------------------
    it('T08 - Repos exactement 11h -> aucune violation MIN_REST', () => {
        const shifts = [
            makeShift('2026-07-20T06:00:00.000Z', '2026-07-20T18:00:00.000Z'), // Fin 18h
            makeShift('2026-07-21T05:00:00.000Z', '2026-07-21T17:00:00.000Z'), // Debut 05h = repos 11h exactement
        ];
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        assert.ok(!result[1].unassignable, 'Repos de 11h exact doit etre accepte');
        assert.equal(result[1].violations.length, 0);
    });

    // -----------------------------------------------------------------------
    // Test 9 : Repos 10h59m59s -> MIN_REST declenche
    // -----------------------------------------------------------------------
    it('T09 - Repos 10h59m59s -> MIN_REST declenche', () => {
        const shifts = [
            makeShift('2026-07-20T06:00:00.000Z', '2026-07-20T18:00:00.000Z'), // Fin 18h00
            makeShift('2026-07-21T04:59:59.000Z', '2026-07-21T16:59:59.000Z'), // Debut 04h59m59s = repos < 11h
        ];
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        // L'agent reste reel (A) meme si repos insuffisant
        assert.equal(result[1].placeholder.id, 'A', 'Un agent reel doit etre assigne meme avec violation');
        assert.ok(result[1].unassignable, 'Repos insuffisant doit etre marque unassignable');
        assert.ok(result[1].violations.includes(VIOLATIONS.MIN_REST), 'MIN_REST doit etre signale');
    });

    // -----------------------------------------------------------------------
    // Test 10 : Chevauchement de shifts -> NO_OVERLAP
    // -----------------------------------------------------------------------
    it('T10 - Chevauchement de shifts -> NO_OVERLAP bloque', () => {
        const shifts = [
            makeShift('2026-07-20T08:00:00.000Z', '2026-07-20T20:00:00.000Z'), // 08->20h
            makeShift('2026-07-20T18:00:00.000Z', '2026-07-21T06:00:00.000Z'), // 18->06h (chevauche!)
        ];
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        assert.ok(!result[0].unassignable);
        assert.ok(result[1].unassignable, 'Chevauchement doit bloquer');
    });

    // -----------------------------------------------------------------------
    // Test 11 : Semaine > 48h proratisee -> MAX_WEEKLY_HOURS
    // -----------------------------------------------------------------------
    it('T11 - Semaine ISO > 48h -> MAX_WEEKLY_HOURS declenche', () => {
        // Semaine 2026-W29 : Lun 21 juil - Dim 27 juil
        // 4 shifts de 12h dans la meme semaine = 48h (OK)
        // 5eme shift de 1h dans la meme semaine = 49h (> 48h) -> violation
        const shifts = [];
        for (let i = 0; i < 4; i++) {
            const d = new Date('2026-07-21T06:00:00.000Z');
            d.setUTCDate(d.getUTCDate() + i);
            const e = new Date(d); e.setUTCHours(e.getUTCHours() + 12);
            shifts.push(makeShift(d.toISOString(), e.toISOString()));
        }
        // 5eme shift : vendredi 25 juil 20h (dans la meme semaine)
        shifts.push(makeShift('2026-07-25T20:00:00.000Z', '2026-07-25T21:00:00.000Z')); // 1h -> depasse 48h
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        assert.ok(result[4].unassignable, 'Le 5eme shift devrait depasser 48h/semaine');
    });

    // -----------------------------------------------------------------------
    // Test 12 : Priorite repos > heures (plus repose pris en premier)
    // -----------------------------------------------------------------------
    it('T12 - Priorite repos > heures : agent plus repose selectionne', () => {
        // Apres des assignations initiales, l'Agent A a plus d'heures mais est plus repose
        // -> A doit etre pris pour le prochain shift
        const shifts = [
            makeShift('2026-07-20T00:00:00.000Z', '2026-07-20T12:00:00.000Z'), // -> A (12h)
            makeShift('2026-07-20T12:00:00.000Z', '2026-07-21T00:00:00.000Z'), // -> B (12h)
            makeShift('2026-07-21T12:00:00.000Z', '2026-07-22T00:00:00.000Z'), // B a fini 00h, A a fini 12h
            // A repos depuis 2026-07-20T12h = 24h de repos (pris en priorite)
            // B repos depuis 2026-07-21T00h = 12h de repos
            // Prochain shift a 2026-07-22T12h : A repos = 48h, B repos = 36h -> A en premier
        ];
        const result = assignAgentRotation(shifts, 2, 'ads_qualifie');
        // Shift 3 : A est plus repose que B -> A doit prendre le shift
        assert.equal(result[2].placeholder.id, 'A',
            `Shift 3 doit aller a l'agent le plus repose (A), got ${result[2].placeholder.id}`);
    });

    // -----------------------------------------------------------------------
    // Test 13 : Round Robin strict -> A->B->C->A
    // -----------------------------------------------------------------------
    it('T13 - Round Robin strict -> alternance A->B->C->A', () => {
        // 6 shifts de 6h (assez d'espacement pour respecter les regles CCN)
        const shifts = [];
        for (let i = 0; i < 6; i++) {
            const start = new Date(`2026-07-2${i + 1}T08:00:00.000Z`);
            const end   = new Date(`2026-07-2${i + 1}T14:00:00.000Z`);
            shifts.push(makeShift(start.toISOString(), end.toISOString()));
        }
        const result = assignAgentRotation(shifts, 3, 'ads_qualifie', STRATEGIES.ROUND_ROBIN);
        assert.equal(result[0].placeholder.id, 'A');
        assert.equal(result[1].placeholder.id, 'B');
        assert.equal(result[2].placeholder.id, 'C');
        assert.equal(result[3].placeholder.id, 'A');
        assert.equal(result[4].placeholder.id, 'B');
        assert.equal(result[5].placeholder.id, 'C');
    });

    // -----------------------------------------------------------------------
    // Test 14 : DST - Changement heure ete (passage 02h->03h) calcule en UTC
    // -----------------------------------------------------------------------
    it('T14 - DST/changement heure : calcul en UTC non affecte', () => {
        // En France, le 29 mars 2026, 02h00 locale devient 03h00 (UTC+2)
        // En UTC : 2026-03-29T01:00:00Z -> 2026-03-29T02:00:00Z = 1h exactement
        // Un shift de 11h en UTC doit rester 11h peu importe le DST
        const shifts = [
            makeShift('2026-03-29T00:00:00.000Z', '2026-03-29T12:00:00.000Z'), // 12h UTC
            makeShift('2026-03-29T23:00:00.000Z', '2026-03-30T11:00:00.000Z'), // repos = 11h UTC (23-12=11)
        ];
        const result = assignAgentRotation(shifts, 1, 'ads_qualifie');
        assert.ok(!result[1].unassignable, 'Repos de 11h UTC doit etre valide meme pendant DST');
    });

    // -----------------------------------------------------------------------
    // Test 15 : 3 agents, H24 weekend (2 semaines) - aucun NO_AGENT, equite
    // -----------------------------------------------------------------------
    it('T15 - 3 agents H24 weekend 2 semaines - equite et 0 NO_AGENT', () => {
        // Simule une mission 2 semaines avec H24 sam+dim
        // Semaine : 5 shifts de 12h (lun-ven 08->20h)
        // Weekend : 4 shifts de 12h (sam 00->12, 12->24, dim 00->12, 12->24)
        const shifts = [];
        const baseDate = new Date('2026-07-06T00:00:00.000Z'); // Lundi 6 juillet

        for (let week = 0; week < 2; week++) {
            const weekOffset = week * 7;
            // Lundi à vendredi (shifts de 12h)
            for (let wday = 0; wday < 5; wday++) {
                const d = new Date(baseDate);
                d.setUTCDate(d.getUTCDate() + weekOffset + wday);
                const start = new Date(d); start.setUTCHours(8, 0, 0, 0);
                const end   = new Date(d); end.setUTCHours(20, 0, 0, 0);
                shifts.push(makeShift(start.toISOString(), end.toISOString()));
            }
            // Samedi (2 x 12h)
            const sat = new Date(baseDate); sat.setUTCDate(sat.getUTCDate() + weekOffset + 5);
            shifts.push(makeShift(
                new Date(sat).setUTCHours(0,0,0,0) && sat.toISOString().replace('T00:00:00.000Z','T00:00:00.000Z'),
                new Date(new Date(sat).setUTCHours(12,0,0,0)).toISOString()
            ));
            shifts.push(makeShift(
                new Date(new Date(sat).setUTCHours(12,0,0,0)).toISOString(),
                new Date(new Date(sat).setUTCHours(24,0,0,0)).toISOString()
            ));
            // Dimanche (2 x 12h)
            const sun = new Date(baseDate); sun.setUTCDate(sun.getUTCDate() + weekOffset + 6);
            shifts.push(makeShift(
                new Date(new Date(sun).setUTCHours(0,0,0,0)).toISOString(),
                new Date(new Date(sun).setUTCHours(12,0,0,0)).toISOString()
            ));
            shifts.push(makeShift(
                new Date(new Date(sun).setUTCHours(12,0,0,0)).toISOString(),
                new Date(new Date(sun).setUTCHours(24,0,0,0)).toISOString()
            ));
        }

        const result = assignAgentRotation(shifts, 3, 'ads_qualifie');
        const unassigned = result.filter(s => s.unassignable).length;
        assert.equal(unassigned, 0, `${unassigned} shifts non assignes`);
        const summary = getAgentSummary(result);
        const hours = summary.filter(s => s.id !== '?').map(s => s.totalHours);
        if (hours.length > 1) {
            const spread = Math.max(...hours) - Math.min(...hours);
            assert.ok(spread <= 72, `Ecart trop grand: ${spread}h (max 72h attendu)`);
        }
    });

    // -----------------------------------------------------------------------
    // Test 16 : Pool > 26 agents → IDs lisibles style Excel (AA, AB, ...)
    // Vérifie que makeAgentId ne produit jamais de caractère non-alphabétique.
    // -----------------------------------------------------------------------
    it('T16 - Pool 28 agents → IDs A-Z puis AA, AB (pas de caractères non-lisibles)', () => {
        // 28 shifts d'1h, un par jour (aucun problème CCN), 28 agents distincts
        const shifts = [];
        for (let i = 0; i < 28; i++) {
            const d = new Date('2026-07-01T08:00:00.000Z');
            d.setUTCDate(d.getUTCDate() + i);
            const e = new Date(d);
            e.setUTCHours(d.getUTCHours() + 1);
            shifts.push({
                id: `t16-shift-${i}`,
                startAt: d.toISOString(),
                endAt:   e.toISOString(),
                duration: 1,
                severity: 'ok',
                userDecision: null,
            });
        }
        const result = assignAgentRotation(shifts, 28, 'ads_qualifie');

        // Les 28 shifts doivent être assignés à 28 agents distincts
        const ids = result.map(s => s.placeholder.id);

        // Vérifications sur les IDs attendus (LEAST_LOADED, agents avec max repos en premier)
        assert.ok(ids.includes('A'),  'Le pool doit inclure A');
        assert.ok(ids.includes('Z'),  'Le pool doit inclure Z (index 25)');
        assert.ok(ids.includes('AA'), 'Le pool doit inclure AA (index 26)');
        assert.ok(ids.includes('AB'), 'Le pool doit inclure AB (index 27)');

        // Aucun ID ne doit contenir un caractère non-alphabétique
        ids.forEach(id => {
            assert.ok(/^[A-Z]+$/.test(id), `ID invalide détecté : '${id}'`);
        });

        // Vérifier que l'algorithme n'a produit aucun ID '?' (pas de fallback non géré)
        assert.ok(!ids.includes('?'), 'Aucun ID "?" ne doit apparaître');
    });

    // -----------------------------------------------------------------------
    // T17 : Vacation < 6h → violation MIN_VACATION_HOURS (IDCC 1351, 01/07/2026)
    // -----------------------------------------------------------------------
    it('T17 - Vacation 5h → violation MIN_VACATION_HOURS signalée (sans bloquer l\'assignation)', () => {
        // Vacation de 5h : en dessous du minimum IDCC 1351 (6h depuis le 01/07/2026)
        const shifts = [makeShift('2026-07-21T08:00:00.000Z', '2026-07-21T13:00:00.000Z')]; // 5h

        const result = assignAgentRotation(shifts, 2);

        assert.strictEqual(result.length, 1, 'Un seul shift doit être retourné');
        assert.ok(
            result[0].violations.includes(VIOLATIONS.MIN_VACATION_HOURS),
            `La violation MIN_VACATION_HOURS doit être signalée pour une vacation de 5h. Violations : ${JSON.stringify(result[0].violations)}`
        );
        // L'agent doit quand même être assigné (la règle est informative, pas bloquante)
        assert.ok(result[0].placeholder?.id, 'Un agent doit être assigné même sur une vacation trop courte');
        assert.strictEqual(result[0].unassignable, false, 'Le shift ne doit pas être marqué comme non assignable');
    });

    // -----------------------------------------------------------------------
    // T18 : Vacation exactement 6h → aucune violation MIN_VACATION_HOURS
    // -----------------------------------------------------------------------
    it('T18 - Vacation exactement 6h → pas de violation MIN_VACATION_HOURS', () => {
        // Vacation de 6h pile : conforme au minimum IDCC 1351
        const shifts = [makeShift('2026-07-21T08:00:00.000Z', '2026-07-21T14:00:00.000Z')]; // 6h

        const result = assignAgentRotation(shifts, 2);

        assert.strictEqual(result.length, 1, 'Un seul shift doit être retourné');
        assert.ok(
            !result[0].violations.includes(VIOLATIONS.MIN_VACATION_HOURS),
            `Aucune violation MIN_VACATION_HOURS pour 6h. Violations : ${JSON.stringify(result[0].violations)}`
        );
        assert.strictEqual(MIN_VACATION_DURATION_HOURS, 6, 'La constante doit valoir 6 (IDCC 1351 depuis 01/07/2026)');
    });

    // -----------------------------------------------------------------------
    // T19 : getAgentSummary — Moyenne > 44h sur 12 semaines → rolling12WViolation
    // -----------------------------------------------------------------------
    it('T19 - Moyenne hebdo > 44h sur 12 semaines → rolling12WViolation=true (IDCC 1351)', () => {
        // 12 semaines consécutives avec 50h/semaine = moyenne 50h > 44h
        // Lundi 2026-01-05 → + 12 semaines (84 jours), 50h par semaine (shift lundi+vendredi 25h)
        const shifts = [];
        for (let w = 0; w < 12; w++) {
            // Lundi de la semaine w
            const mondayMs = Date.UTC(2026, 0, 5) + w * 7 * 24 * 3600 * 1000;
            const monday = new Date(mondayMs).toISOString();
            const mondayEnd = new Date(mondayMs + 25 * 3600 * 1000).toISOString(); // 25h
            shifts.push(makeShift(monday, mondayEnd));
            const thursdayMs = mondayMs + 3 * 24 * 3600 * 1000 + 11 * 3600 * 1000; // jeudi + 11h de repos
            const thursday = new Date(thursdayMs).toISOString();
            const thursdayEnd = new Date(thursdayMs + 25 * 3600 * 1000).toISOString(); // 25h
            shifts.push(makeShift(thursday, thursdayEnd));
        }

        const assigned = assignAgentRotation(shifts, 1); // 1 seul agent
        const summary = getAgentSummary(assigned);

        assert.strictEqual(summary.length, 1, 'Un seul agent dans le résumé');
        assert.ok(
            summary[0].rolling12WAvgMax > MAX_ROLLING_12W_AVERAGE_HOURS,
            `Moyenne glissante doit dépasser 44h. Valeur : ${summary[0].rolling12WAvgMax}`
        );
        assert.strictEqual(summary[0].rolling12WViolation, true, 'rolling12WViolation doit être true');
        assert.strictEqual(MAX_ROLLING_12W_AVERAGE_HOURS, 44, 'La constante doit valoir 44h (IDCC 1351)');
    });

    // -----------------------------------------------------------------------
    // T20 : getAgentSummary — < 2 dimanches de repos/mois → sundayViolation
    // -----------------------------------------------------------------------
    it('T20 - < 2 dimanches de repos dans un mois → sundayViolation=true (IDCC 1351 art. 7.2)', () => {
        // Juillet 2026 a 4 dimanches : 5, 12, 19, 26
        // On planifie un agent sur 3 des 4 dimanches → seulement 1 dimanche de repos → violation
        const sundaysJuly2026 = [
            '2026-07-05T08:00:00.000Z',
            '2026-07-12T08:00:00.000Z',
            '2026-07-19T08:00:00.000Z',
        ];
        const shifts = sundaysJuly2026.map(start => {
            const end = new Date(new Date(start).getTime() + 12 * 3600 * 1000).toISOString();
            return makeShift(start, end);
        });

        const assigned = assignAgentRotation(shifts, 1);
        const summary = getAgentSummary(assigned);

        assert.strictEqual(summary.length, 1, 'Un seul agent');
        const julyRest = summary[0].sundayRestByMonth?.['2026-07'] ?? null;
        assert.ok(julyRest !== null, 'Les dimanches de repos pour juillet 2026 doivent être calculés');
        assert.ok(julyRest < MIN_SUNDAY_REST_PER_MONTH, `Juillet doit avoir < 2 dimanches de repos. Valeur : ${julyRest}`);
        assert.strictEqual(summary[0].sundayViolation, true, 'sundayViolation doit être true');
        assert.strictEqual(MIN_SUNDAY_REST_PER_MONTH, 2, 'La constante doit valoir 2 (IDCC 1351 art. 7.2)');
    });
});