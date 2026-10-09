/**
 * TimeSegmenter.test.js — Tests unitaires exhaustifs pour TimeSegmenter
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { segmentTimeInterval, isTimeInNightWindow, checkHoliday, getHolidaysService } from './TimeSegmenter.js';

test('TimeSegmenter — Découpage simple d\'une vacation de jour en semaine', () => {
    // Lundi 15 juin 2026 de 08:00 à 17:00 (9 heures)
    const start = new Date(2026, 5, 15, 8, 0, 0);
    const end = new Date(2026, 5, 15, 17, 0, 0);

    const segments = segmentTimeInterval(start, end);

    assert.equal(segments.length, 1);
    assert.equal(segments[0].durationMinutes, 9 * 60);
    assert.equal(segments[0].isNight, false);
    assert.equal(segments[0].isSunday, false);
    assert.equal(segments[0].isHoliday, false);
    assert.equal(segments[0].category, 'DAY_WEEK');
});

test('TimeSegmenter — Vacation franchissant la nuit (18h00 - 02h00)', () => {
    // Lundi 15 juin 2026 de 18:00 à Mardi 16 juin 02:00
    // De 18h00 à 21h00 : Jour semaine (3h)
    // De 21h00 à 00h00 : Nuit semaine (3h)
    // De 00h00 à 02h00 : Nuit semaine (2h)
    const start = new Date(2026, 5, 15, 18, 0, 0);
    const end = new Date(2026, 5, 16, 2, 0, 0);

    const segments = segmentTimeInterval(start, end);

    assert.equal(segments.length, 3);

    // Segment 1 : 18:00 - 21:00
    assert.equal(segments[0].durationMinutes, 180);
    assert.equal(segments[0].isNight, false);
    assert.equal(segments[0].category, 'DAY_WEEK');

    // Segment 2 : 21:00 - 00:00
    assert.equal(segments[1].durationMinutes, 180);
    assert.equal(segments[1].isNight, true);
    assert.equal(segments[1].category, 'NIGHT_WEEK');

    // Segment 3 : 00:00 - 02:00
    assert.equal(segments[2].durationMinutes, 120);
    assert.equal(segments[2].isNight, true);
    assert.equal(segments[2].category, 'NIGHT_WEEK');

    // Somme totale exacte : 8h
    const totalMinutes = segments.reduce((sum, s) => sum + s.durationMinutes, 0);
    assert.equal(totalMinutes, 8 * 60);
});

test('TimeSegmenter — Vacation Samedi soir vers Dimanche (20h00 Samedi - 08h00 Dimanche)', () => {
    // Samedi 20 juin 2026 20:00 -> Dimanche 21 juin 2026 08:00 (12h)
    // 20h-21h : Samedi Jour (1h)
    // 21h-00h : Samedi Nuit (3h)
    // 00h-06h : Dimanche Nuit (6h)
    // 06h-08h : Dimanche Jour (2h)
    const start = new Date(2026, 5, 20, 20, 0, 0);
    const end = new Date(2026, 5, 21, 8, 0, 0);

    const segments = segmentTimeInterval(start, end);

    assert.equal(segments.length, 4);

    assert.equal(segments[0].category, 'DAY_WEEK');
    assert.equal(segments[0].durationMinutes, 60);

    assert.equal(segments[1].category, 'NIGHT_WEEK');
    assert.equal(segments[1].durationMinutes, 180);

    assert.equal(segments[2].category, 'NIGHT_SUNDAY');
    assert.equal(segments[2].durationMinutes, 360);
    assert.equal(segments[2].isSunday, true);
    assert.equal(segments[2].isNight, true);

    assert.equal(segments[3].category, 'DAY_SUNDAY');
    assert.equal(segments[3].durationMinutes, 120);
    assert.equal(segments[3].isSunday, true);
    assert.equal(segments[3].isNight, false);

    const totalMinutes = segments.reduce((sum, s) => sum + s.durationMinutes, 0);
    assert.equal(totalMinutes, 12 * 60);
});

test('TimeSegmenter — 1er Mai (Fête du travail)', () => {
    // Vendredi 1er mai 2026 de 07:00 à 19:00 (12h)
    const start = new Date(2026, 4, 1, 7, 0, 0);
    const end = new Date(2026, 4, 1, 19, 0, 0);

    const segments = segmentTimeInterval(start, end);

    assert.equal(segments.length, 1);
    assert.equal(segments[0].isMayFirst, true);
    assert.equal(segments[0].isHoliday, true);
    assert.equal(segments[0].category, 'DAY_MAY_FIRST');
});

test('TimeSegmenter — 14 Juillet (Jour férié classique)', () => {
    // Mardi 14 juillet 2026 de 20:00 à Mercredi 15 juillet 04:00 (8h)
    // 20h-21h : 14 Juillet Férié Jour (1h)
    // 21h-00h : 14 Juillet Férié Nuit (3h)
    // 00h-04h : 15 Juillet Nuit Semaine (4h)
    const start = new Date(2026, 6, 14, 20, 0, 0);
    const end = new Date(2026, 6, 15, 4, 0, 0);

    const segments = segmentTimeInterval(start, end);

    assert.equal(segments.length, 3);
    assert.equal(segments[0].category, 'DAY_HOLIDAY');
    assert.equal(segments[0].isHoliday, true);

    assert.equal(segments[1].category, 'NIGHT_HOLIDAY');
    assert.equal(segments[1].isHoliday, true);
    assert.equal(segments[1].isNight, true);

    assert.equal(segments[2].category, 'NIGHT_WEEK');
    assert.equal(segments[2].isHoliday, false);
    assert.equal(segments[2].isNight, true);
});

test('TimeSegmenter — Gestion de la région Alsace-Moselle (Vendredi Saint)', () => {
    // Vendredi Saint 2026 en Moselle (FR-57) est férié : 3 avril 2026
    const start = new Date(2026, 3, 3, 10, 0, 0);
    const end = new Date(2026, 3, 3, 14, 0, 0);

    // En France générale : pas férié
    const segNational = segmentTimeInterval(start, end, { holidayRegion: 'FR' });
    assert.equal(segNational[0].isHoliday, false);

    // En Moselle : férié
    const segAlsace = segmentTimeInterval(start, end, { holidayRegion: 'FR', state: '57' });
    assert.equal(segAlsace[0].isHoliday, true);
    assert.equal(segAlsace[0].category, 'DAY_HOLIDAY');
});
