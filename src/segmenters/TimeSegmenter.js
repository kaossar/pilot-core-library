/**
 * TimeSegmenter.js — Moteur de découpage temporel précis (à la minute)
 * 
 * Responsabilité :
 * Scinder tout intervalle de travail [début, fin] en segments élémentaires homogènes
 * au franchissement de tout seuil charnière :
 * - Heure de bascule de nuit (par défaut 21h00 et 06h00)
 * - Minuit local (séparation stricte de chaque jour calendaire)
 * - Dimanches (00h00 - 24h00)
 * - Jours fériés légaux (selon calendrier national / régional, ex: Alsace-Moselle, DOM-TOM)
 * - 1er Mai (fête du travail — régime d'ordre public légal L.3133-6)
 * 
 * Règles d'or :
 * 1. Zéro effet de bord, logique 100 % pure et déterministe.
 * 2. Précision à la minute près.
 * 3. Aucune perte ni duplication de temps (somme des durées des segments = durée totale).
 * 4. Commentaires 100 % en français.
 */

import Holidays from 'date-holidays';

// Cache des instances de calendrier de jours fériés pour éviter les instanciations répétitives
const holidaysCache = new Map();

/**
 * Retourne ou instancie le calendrier des jours fériés pour un pays/région donné.
 * @param {string} [country='FR'] - Code pays ISO
 * @param {string|null} [state=null] - Région / département (ex: '57', '67', '68', 'GP', 'MQ'...)
 * @returns {Holidays}
 */
export function getHolidaysService(country = 'FR', state = null) {
    let c = country || 'FR';
    let s = state;

    if (c.includes('-')) {
        const parts = c.split('-');
        c = parts[0];
        s = parts[1];
    }

    const key = `${c}_${s || 'all'}`;
    if (!holidaysCache.has(key)) {
        holidaysCache.set(key, s ? new Holidays(c, s) : new Holidays(c));
    }
    return holidaysCache.get(key);
}

/**
 * Analyse si une date calendaire locale est un jour férié.
 * Distingue spécifiquement le 1er Mai.
 * @param {Date} date - Date à évaluer
 * @param {Holidays} hd - Instance configurée de date-holidays
 * @returns {{ isHoliday: boolean, isMayFirst: boolean, holidayName: string | null }}
 */
export function checkHoliday(date, hd) {
    const isMayFirst = (date.getMonth() === 4 && date.getDate() === 1); // Mois 4 = Mai (0-indexé)
    
    // date-holidays prend en compte l'année
    const holidayInfo = hd.isHoliday(date);
    const isHoliday = Boolean(holidayInfo);
    
    let holidayName = null;
    if (holidayInfo) {
        if (Array.isArray(holidayInfo) && holidayInfo.length > 0) {
            holidayName = holidayInfo[0].name;
        } else if (typeof holidayInfo === 'object' && holidayInfo.name) {
            holidayName = holidayInfo.name;
        } else {
            holidayName = isMayFirst ? 'Fête du Travail' : 'Jour férié';
        }
    } else if (isMayFirst) {
        // Sécurité si non répertorié par le package
        holidayName = 'Fête du Travail';
    }

    return {
        isHoliday: isHoliday || isMayFirst,
        isMayFirst,
        holidayName
    };
}

/**
 * Vérifie si une heure (HH:MM) se situe dans la plage de nuit.
 * Supporte le franchissement de minuit (ex: 21:00 à 06:00).
 * @param {number} hours - Heure (0-23)
 * @param {number} minutes - Minutes (0-59)
 * @param {number} nightStartHour - Heure début nuit (ex: 21)
 * @param {number} nightStartMinute - Minute début nuit (ex: 0)
 * @param {number} nightEndHour - Heure fin nuit (ex: 6)
 * @param {number} nightEndMinute - Minute fin nuit (ex: 0)
 * @returns {boolean}
 */
export function isTimeInNightWindow(hours, minutes, nightStartHour, nightStartMinute, nightEndHour, nightEndMinute) {
    const currentMins = hours * 60 + minutes;
    const startMins = nightStartHour * 60 + nightStartMinute;
    const endMins = nightEndHour * 60 + nightEndMinute;

    if (startMins > endMins) {
        // La plage traverse minuit (ex: 21h00 -> 06h00)
        return currentMins >= startMins || currentMins < endMins;
    } else {
        // Plage intra-journalière (ex: 01h00 -> 05h00)
        return currentMins >= startMins && currentMins < endMins;
    }
}

/**
 * Détermine la catégorie conventionnelle IDCC 1351 d'un créneau homogène.
 * @param {Object} params
 * @param {boolean} params.isNight
 * @param {boolean} params.isSunday
 * @param {boolean} params.isHoliday
 * @param {boolean} params.isMayFirst
 * @returns {string} Code de catégorie standard
 */
export function resolveSegmentCategory({ isNight, isSunday, isHoliday, isMayFirst }) {
    if (isMayFirst) {
        if (isSunday && isNight) return 'NIGHT_SUN_MAY_FIRST';
        if (isSunday) return 'DAY_SUN_MAY_FIRST';
        if (isNight) return 'NIGHT_MAY_FIRST';
        return 'DAY_MAY_FIRST';
    }

    if (isHoliday) {
        if (isSunday && isNight) return 'NIGHT_SUN_HOL';
        if (isSunday) return 'DAY_SUN_HOL';
        if (isNight) return 'NIGHT_HOLIDAY';
        return 'DAY_HOLIDAY';
    }

    if (isSunday) {
        if (isNight) return 'NIGHT_SUNDAY';
        return 'DAY_SUNDAY';
    }

    if (isNight) {
        return 'NIGHT_WEEK';
    }

    return 'DAY_WEEK';
}

/**
 * Découpe un intervalle temporel en segments homogènes à la minute.
 * 
 * @param {Date|string|number} startInput - Début du créneau
 * @param {Date|string|number} endInput - Fin du créneau
 * @param {Object} [options={}] - Options de configuration
 * @param {string} [options.nightStart='21:00'] - Heure de début de nuit
 * @param {string} [options.nightEnd='06:00'] - Heure de fin de nuit
 * @param {string} [options.holidayRegion='FR'] - Code pays / région des jours fériés
 * @param {string|null} [options.state=null] - Sous-région optionnelle (ex: '57')
 * @returns {Array<Object>} Tableau des segments découpés
 */
export function segmentTimeInterval(startInput, endInput, options = {}) {
    const startDate = new Date(startInput);
    const endDate = new Date(endInput);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Dates d\'entrée invalides fournies à segmentTimeInterval');
    }

    if (endDate <= startDate) {
        return [];
    }

    const {
        nightStart = '21:00',
        nightEnd = '06:00',
        holidayRegion = 'FR',
        state = null
    } = options;

    const [nightStartH, nightStartM] = nightStart.split(':').map(Number);
    const [nightEndH, nightEndM] = nightEnd.split(':').map(Number);
    const hd = getHolidaysService(holidayRegion, state);

    // 1. Collecter tous les points de rupture chronologiques dans l'intervalle [startDate, endDate]
    // Les ruptures surviennent à :
    // - Début (startDate)
    // - Fin (endDate)
    // - Chaque minuit (00h00)
    // - Chaque début de nuit (ex: 21h00)
    // - Chaque fin de nuit (ex: 06h00)

    const breakPointsSet = new Set();
    breakPointsSet.add(startDate.getTime());
    breakPointsSet.add(endDate.getTime());

    // Itérer jour par jour pour placer les transitions
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
    const lastDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1, 0, 0, 0, 0);

    while (cursor <= lastDay) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const d = cursor.getDate();

        // Minuit
        const midnight = new Date(y, m, d, 0, 0, 0, 0).getTime();
        if (midnight > startDate.getTime() && midnight < endDate.getTime()) {
            breakPointsSet.add(midnight);
        }

        // Fin de nuit (ex: 06h00)
        const mornNightEnd = new Date(y, m, d, nightEndH, nightEndM, 0, 0).getTime();
        if (mornNightEnd > startDate.getTime() && mornNightEnd < endDate.getTime()) {
            breakPointsSet.add(mornNightEnd);
        }

        // Début de nuit (ex: 21h00)
        const eveNightStart = new Date(y, m, d, nightStartH, nightStartM, 0, 0).getTime();
        if (eveNightStart > startDate.getTime() && eveNightStart < endDate.getTime()) {
            breakPointsSet.add(eveNightStart);
        }

        cursor.setDate(cursor.getDate() + 1);
    }

    // 2. Trier les points de rupture
    const sortedPoints = Array.from(breakPointsSet).sort((a, b) => a - b);

    // 3. Construire chaque segment
    const segments = [];

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const segStartMs = sortedPoints[i];
        const segEndMs = sortedPoints[i + 1];

        if (segEndMs <= segStartMs) continue;

        const segStart = new Date(segStartMs);
        const segEnd = new Date(segEndMs);

        const durationMinutes = Math.round((segEndMs - segStartMs) / (1000 * 60));
        const durationHours = durationMinutes / 60;

        // Évaluer le milieu du segment pour classifier ses propriétés de façon stable
        const midpoint = new Date(segStartMs + (segEndMs - segStartMs) / 2);

        // Nuit
        const isNight = isTimeInNightWindow(
            midpoint.getHours(),
            midpoint.getMinutes(),
            nightStartH,
            nightStartM,
            nightEndH,
            nightEndM
        );

        // Dimanche (0 = Dimanche en JavaScript)
        const isSunday = midpoint.getDay() === 0;

        // Férié / 1er Mai
        const { isHoliday, isMayFirst, holidayName } = checkHoliday(midpoint, hd);

        // Catégorie
        const category = resolveSegmentCategory({ isNight, isSunday, isHoliday, isMayFirst });

        segments.push({
            start: segStart.toISOString(),
            end: segEnd.toISOString(),
            date: segStart.toISOString().split('T')[0],
            durationMinutes,
            durationHours: Number(durationHours.toFixed(4)),
            isNight,
            isSunday,
            isHoliday,
            isMayFirst,
            holidayName,
            category
        });
    }

    return segments;
}
