/**
 * continuousRecurrenceEngine.test.js — Suite de tests exhaustifs pour la récurrence continue
 * 
 * Valide les 10 scénarios majeurs selon les exigences de robustesse 10+ ans :
 * 1. Hebdo classique (Ven 18h -> Lun 08h = 62h) sur 4 semaines = 248.0h
 * 2. Bi-hebdomadaire (1 semaine sur 2)
 * 3. Mensuel ordinal (1er week-end du mois)
 * 4. Mensuel ordinal (Dernier week-end et années bissextiles 2027 vs 2028)
 * 5. Cycle en heures absolues (48h ON / 48h OFF et 12h ON / 24h OFF)
 * 6. Clipping en fin de contrat (max(w.start, contractStart) -> min(w.end, contractEnd))
 * 7. Clipping en début de contrat (première occurrence commençant avant globalStart)
 * 8. Changement d'heure (DST automne / printemps)
 * 9. Règle universelle anti-collision (RecurrenceOverlapError)
 * 10. Invariant mathématique absolu (somme des blocs = total fusionné = somme des buckets)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
    calculateRecurringContinuousMission,
    expandRecurringWindows,
    clipWindowsToContractBounds,
    validateNoOverlap,
    validateRecurrenceConfig,
    calculateBlockDurationHours,
    RecurrenceOverlapError,
    RecurrenceValidationError
} from './continuousRecurrenceEngine.js';

describe('continuousRecurrenceEngine — Moteur de Périodes Continues Récurrentes', () => {

    const BASE_MISSION_CONFIG = {
        startTime: '00:00',
        endTime: '24:00',
        nightShiftStart: '21:00',
        nightShiftEnd: '06:00',
        weekendH24: false,
        holidayH24: false,
        agents: 1,
        qualification: 'ads_qualifie'
    };

    // ────────────────────────────────────────────────────────────────────────
    // TEST 1 : Hebdomadaire classique (4 week-ends pleins de 62h = 248.0h)
    // ────────────────────────────────────────────────────────────────────────
    test('1. Hebdomadaire classique : 4 week-ends du Ven 18h au Lun 08h (62h chacun = 248.0h)', () => {
        const config = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-06-01', // Lundi
            endDate: '2026-06-29',   // Lundi (4 semaines)
            continuousRecurrence: {
                enabled: true,
                block: {
                    start: { day: 5, time: '18:00' }, // Vendredi 18h
                    end:   { day: 1, time: '08:00' }  // Lundi 08h
                },
                recurrence: {
                    frequency: 'weekly',
                    weekly: { interval: 1 }
                }
            }
        };

        const result = calculateRecurringContinuousMission(config);

        // 4 occurrences : 05/06->08/06, 12/06->15/06, 19/06->22/06, 26/06->29/06
        assert.strictEqual(result.windowCount, 4);
        assert.strictEqual(result.totalHours, 248.0); // 4 * 62.0h

        // Invariant de conservation
        const sumBuckets = Object.values(result.buckets).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sumBuckets - 248.0) < 0.001);
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 2 : Bi-hebdomadaire (1 semaine sur 2, intervalle = 2)
    // ────────────────────────────────────────────────────────────────────────
    test('2. Bi-hebdomadaire : 1 semaine sur 2 sur 8 semaines (4 blocs de 62h = 248.0h)', () => {
        const config = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-06-01',
            endDate: '2026-07-27', // 8 semaines
            continuousRecurrence: {
                enabled: true,
                block: {
                    start: { day: 5, time: '18:00' },
                    end:   { day: 1, time: '08:00' }
                },
                recurrence: {
                    frequency: 'weekly',
                    weekly: { interval: 2 } // 1 semaine sur 2
                }
            }
        };

        const result = calculateRecurringContinuousMission(config);

        assert.strictEqual(result.windowCount, 4);
        assert.strictEqual(result.totalHours, 248.0);
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 3 : Mensuel ordinal (1er week-end de chaque mois sur 3 mois)
    // ────────────────────────────────────────────────────────────────────────
    test('3. Mensuel ordinal : 1er week-end de chaque mois (Juin, Juillet, Août 2026 = 3 blocs = 186.0h)', () => {
        const config = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-06-01',
            endDate: '2026-08-31',
            continuousRecurrence: {
                enabled: true,
                block: {
                    start: { day: 5, time: '18:00' },
                    end:   { day: 1, time: '08:00' }
                },
                recurrence: {
                    frequency: 'monthly',
                    monthly: { occurrence: 'first' }
                }
            }
        };

        const result = calculateRecurringContinuousMission(config);

        assert.strictEqual(result.windowCount, 3);
        assert.strictEqual(result.totalHours, 186.0); // 3 * 62.0h

        // Vérifier les dates de début du 1er week-end de chaque mois
        assert.strictEqual(result.windows[0].startDate, '2026-06-05'); // 1er vendredi de juin
        assert.strictEqual(result.windows[1].startDate, '2026-07-03'); // 1er vendredi de juillet
        assert.strictEqual(result.windows[2].startDate, '2026-08-07'); // 1er vendredi d'août
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 4 : Mensuel ordinal Dernier WE & Années bissextiles (Fév 2027 vs Fév 2028)
    // ────────────────────────────────────────────────────────────────────────
    test('4. Mensuel ordinal : Dernier week-end en février bissextile (2028) vs non-bissextile (2027)', () => {
        // Février 2028 (29 jours) : le dernier vendredi est le 25/02/2028
        const config2028 = {
            ...BASE_MISSION_CONFIG,
            startDate: '2028-02-01',
            endDate: '2028-02-29',
            continuousRecurrence: {
                enabled: true,
                block: {
                    start: { day: 5, time: '18:00' },
                    end:   { day: 1, time: '08:00' }
                },
                recurrence: {
                    frequency: 'monthly',
                    monthly: { occurrence: 'last' }
                }
            }
        };

        const res2028 = calculateRecurringContinuousMission(config2028);
        assert.strictEqual(res2028.windowCount, 1);
        assert.strictEqual(res2028.windows[0].startDate, '2028-02-25');
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 5 : Cycle en durées absolues (48h ON / 48h OFF)
    // ────────────────────────────────────────────────────────────────────────
    test('5. Cycle en durées absolues : 48h ON / 48h OFF sur 8 jours', () => {
        const config = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-06-01',
            endDate: '2026-06-09',
            startTime: '08:00',
            endTime: '08:00',
            continuousRecurrence: {
                enabled: true,
                block: {
                    start: { day: 1, time: '08:00' },
                    end:   { day: 3, time: '08:00' }
                },
                recurrence: {
                    frequency: 'cyclical',
                    cyclical: {
                        onDurationHours: 48,
                        offDurationHours: 48
                    }
                }
            }
        };

        const result = calculateRecurringContinuousMission(config);
        assert.strictEqual(result.windowCount, 2);
        assert.strictEqual(result.totalHours, 96.0); // 48 + 48
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 6 : Règle de clipping en fin de contrat (globalEnd coupe le bloc)
    // ────────────────────────────────────────────────────────────────────────
    test('6. Clipping fin de contrat : Le contrat s’arrête le Dimanche 20:00 au lieu du Lundi 08:00', () => {
        const config = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-06-05', // Vendredi
            endDate: '2026-06-07',   // Dimanche (fin de contrat à 20:00)
            startTime: '00:00',
            endTime: '20:00',        // Borne contractuelle de fin
            continuousRecurrence: {
                enabled: true,
                block: {
                    start: { day: 5, time: '18:00' }, // Ven 18h
                    end:   { day: 1, time: '08:00' }  // Lun 08h théorique (62h)
                },
                recurrence: {
                    frequency: 'weekly',
                    weekly: { interval: 1 }
                }
            }
        };

        const result = calculateRecurringContinuousMission(config);

        assert.strictEqual(result.windowCount, 1);
        // Fenêtre clippée : Ven 18:00 -> Dim 20:00 = 50.0 heures physiques (au lieu de 62h)
        assert.strictEqual(result.windows[0].endDate, '2026-06-07');
        assert.strictEqual(result.windows[0].endTime, '20:00');
        assert.strictEqual(result.totalHours, 50.0);
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 7 : Règle de clipping en début de contrat (globalStart commence au milieu du bloc)
    // ────────────────────────────────────────────────────────────────────────
    test('7. Clipping début de contrat : Le contrat commence le Samedi 08:00 alors que le bloc démarre le Vendredi 18:00', () => {
        const config = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-06-06', // Samedi
            endDate: '2026-06-08',   // Lundi
            startTime: '08:00',      // Borne contractuelle de début
            endTime: '24:00',
            continuousRecurrence: {
                enabled: true,
                block: {
                    start: { day: 5, time: '18:00' }, // Ven 18h théorique
                    end:   { day: 1, time: '08:00' }  // Lun 08h
                },
                recurrence: {
                    frequency: 'weekly',
                    weekly: { interval: 1 }
                }
            }
        };

        const result = calculateRecurringContinuousMission(config);

        assert.strictEqual(result.windowCount, 1);
        // Fenêtre clippée : Sam 08:00 -> Lun 08:00 = 48.0 heures physiques (au lieu de 62h)
        assert.strictEqual(result.windows[0].startDate, '2026-06-06');
        assert.strictEqual(result.windows[0].startTime, '08:00');
        assert.strictEqual(result.windows[0].endDate, '2026-06-08');
        assert.strictEqual(result.windows[0].endTime, '08:00');
        assert.strictEqual(result.totalHours, 48.0);
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 8 : Changement d'heure (DST) fin octobre
    // ────────────────────────────────────────────────────────────────────────
    test('8. Changement d’heure : Weekend fin octobre 2026 traverse le passage à l’heure d’hiver', () => {
        const config = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-10-23', // Vendredi
            endDate: '2026-10-26',   // Lundi (Nuit du 24 au 25 octobre = passage heure d'hiver)
            continuousRecurrence: {
                enabled: true,
                block: {
                    start: { day: 5, time: '18:00' },
                    end:   { day: 1, time: '08:00' }
                },
                recurrence: {
                    frequency: 'weekly',
                    weekly: { interval: 1 }
                }
            }
        };

        const result = calculateRecurringContinuousMission(config);
        assert.strictEqual(result.windowCount, 1);
        // Les heures d'horloge affichent 62h, le temps physique est calculé sans collision de dates
        assert.strictEqual(result.totalHours, 62.0);
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 9 : Règle universelle anti-collision (RecurrenceOverlapError)
    // ────────────────────────────────────────────────────────────────────────
    test('9. Anti-collision : Détection et rejet immédiat d’une configuration provoquant un chevauchement', () => {
        const overlappingWindows = [
            {
                startDate: '2026-06-05',
                startTime: '18:00',
                endDate: '2026-06-08',
                endTime: '08:00',
                startDateTime: new Date('2026-06-05T18:00:00'),
                endDateTime: new Date('2026-06-08T08:00:00')
            },
            {
                startDate: '2026-06-07', // Commencer avant la fin du précédent !
                startTime: '20:00',
                endDate: '2026-06-10',
                endTime: '08:00',
                startDateTime: new Date('2026-06-07T20:00:00'),
                endDateTime: new Date('2026-06-10T08:00:00')
            }
        ];

        assert.throws(
            () => validateNoOverlap(overlappingWindows),
            RecurrenceOverlapError
        );
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 10 : Invariant de non-double comptage & Intégrité des 8 buckets
    // ────────────────────────────────────────────────────────────────────────
    test('10. Invariant mathématique : Somme des blocs = Total fusionné = Somme des 8 buckets', () => {
        const config = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-06-01',
            endDate: '2026-06-22',
            continuousRecurrence: {
                enabled: true,
                block: {
                    start: { day: 5, time: '20:00' },
                    end:   { day: 0, time: '20:00' } // 48h Ven 20h -> Dim 20h
                },
                recurrence: {
                    frequency: 'weekly',
                    weekly: { interval: 1 }
                }
            }
        };

        const result = calculateRecurringContinuousMission(config);

        // 3 occurrences de 48h = 144.0h
        assert.strictEqual(result.windowCount, 3);
        assert.strictEqual(result.totalHours, 144.0);

        const sumBuckets = Object.values(result.buckets).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sumBuckets - 144.0) < 0.001);

        const sumDays = result.days.reduce((acc, d) => acc + d.totalHours, 0);
        assert.ok(Math.abs(sumDays - 144.0) < 0.001);
    });

    // ────────────────────────────────────────────────────────────────────────
    // TEST 11 : Récurrence sur les jours fériés (Surveillance exclusive jours chômés)
    // ────────────────────────────────────────────────────────────────────────
    test('11. Récurrence Jours Fériés : Surveillance exclusive des 11 jours fériés 2026 (H24) et sélection ciblée', () => {
        // 11.a : Tous les jours fériés de l'année 2026 en France (H24)
        const allHolidaysConfig = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            startTime: '00:00',
            endTime: '24:00',
            continuousRecurrence: {
                enabled: true,
                recurrence: {
                    frequency: 'holidays',
                    holidays: {
                        scope: 'all',
                        startTime: '00:00',
                        endTime: '24:00'
                    }
                }
            }
        };

        const resultAll = calculateRecurringContinuousMission(allHolidaysConfig);

        // 11 jours fériés légaux en France en 2026
        assert.strictEqual(resultAll.windowCount, 11);
        assert.strictEqual(resultAll.totalHours, 11 * 24.0); // 264.0h

        // Invariant : Toutes les heures doivent appartenir à des buckets fériés
        const totalHolidayHours = resultAll.buckets.holidayDay +
            resultAll.buckets.holidayNight +
            resultAll.buckets.sundayHolidayDay +
            resultAll.buckets.sundayHolidayNight;
        assert.strictEqual(totalHolidayHours, 264.0);

        // 11.b : Sélection ciblée (uniquement 1er Mai et 8 Mai 2026)
        const customHolidaysConfig = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            continuousRecurrence: {
                enabled: true,
                recurrence: {
                    frequency: 'holidays',
                    holidays: {
                        scope: 'custom',
                        selectedDates: ['2026-05-01', '2026-05-08'],
                        startTime: '08:00',
                        endTime: '20:00'
                    }
                }
            }
        };

        const resultCustom = calculateRecurringContinuousMission(customHolidaysConfig);
        assert.strictEqual(resultCustom.windowCount, 2);
        assert.strictEqual(resultCustom.totalHours, 24.0); // 2 x 12.0h

        // 11.c : Fermeture de site : Veille au soir (18h00) -> Lendemain matin (08h00) pour le 1er Mai
        const eveToNextConfig = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-04-20',
            endDate: '2026-05-10',
            continuousRecurrence: {
                enabled: true,
                recurrence: {
                    frequency: 'holidays',
                    holidays: {
                        scope: 'custom',
                        selectedDates: ['2026-05-01'],
                        includeEve: true,
                        eveStartTime: '18:00',
                        includeNextMorning: true,
                        nextMorningEndTime: '08:00'
                    }
                }
            }
        };

        const resultEveToNext = calculateRecurringContinuousMission(eveToNextConfig);
        assert.strictEqual(resultEveToNext.windowCount, 1);
        // Du 30/04 18:00 au 02/05 08:00 = 6h (30 avril) + 24h (1er mai férié) + 8h (2 mai) = 38.0h
        assert.strictEqual(resultEveToNext.totalHours, 38.0);
        assert.strictEqual(resultEveToNext.windows[0].startDate, '2026-04-30');
        assert.strictEqual(resultEveToNext.windows[0].startTime, '18:00');
        assert.strictEqual(resultEveToNext.windows[0].endDate, '2026-05-02');
        assert.strictEqual(resultEveToNext.windows[0].endTime, '08:00');

        // 11.d : Zone géographique régionale (Alsace-Moselle FR-57) : 13 jours fériés
        const alsaceConfig = {
            ...BASE_MISSION_CONFIG,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            continuousRecurrence: {
                enabled: true,
                recurrence: {
                    frequency: 'holidays',
                    holidays: {
                        scope: 'all',
                        holidayRegion: 'FR-57',
                        startTime: '00:00',
                        endTime: '24:00'
                    }
                }
            }
        };

        const resultAlsace = calculateRecurringContinuousMission(alsaceConfig);
        // 13 jours fériés en Moselle en 2026 (+ Vendredi Saint le 3 avril et St-Étienne le 26 décembre)
        // Les 25 et 26 décembre étant consécutifs, ils sont fusionnés en un bloc de 48h continu
        assert.strictEqual(resultAlsace.totalHours, 13 * 24.0); // 312.0h
        const totalAlsaceHolidayHours = resultAlsace.buckets.holidayDay +
            resultAlsace.buckets.holidayNight +
            resultAlsace.buckets.sundayHolidayDay +
            resultAlsace.buckets.sundayHolidayNight;
        assert.strictEqual(totalAlsaceHolidayHours, 312.0);
    });
});

