/**
 * continuousRecurrenceEngine.js — Moteur de fenêtrage et de récurrence pour périodes continues
 * 
 * Responsabilité unique (SRP) :
 * 1. Valider la configuration de récurrence continue (block + recurrence).
 * 2. Générer les occurrences de fenêtres temporelles continues réelles dans la période contractuelle.
 * 3. Appliquer le clipping rigoureux aux bornes du contrat : max(w.start, contractStart) -> min(w.end, contractEnd).
 * 4. Valider l'absence stricte de chevauchement (RecurrenceOverlapError).
 * 5. Calculer chaque fenêtre continue via le moteur audité 'missionCalculator.js' et fusionner les journaux sans doublons.
 * 
 * Conçu pour durer 10+ ans selon les principes Clean Architecture et SOLID.
 */

import {
    createLocalDate,
    formatLocalDate,
    timeToMinutes,
    minutesToTime,
    calculateMissionHoursWithJournal,
    buildHolidayCache,
    buildDateRange,
    listHolidaysInRange
} from './missionCalculator.js';

// ============================================================================
// ERREURS MÉTIER DÉDIÉES
// ============================================================================

/**
 * Erreur levée en cas de collision ou de chevauchement entre deux occurrences de périodes continues.
 */
export class RecurrenceOverlapError extends Error {
    constructor(message, details = null) {
        super(message);
        this.name = 'RecurrenceOverlapError';
        this.details = details;
    }
}

/**
 * Erreur levée en cas de paramétrage invalide de la récurrence continue.
 */
export class RecurrenceValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RecurrenceValidationError';
    }
}

// ============================================================================
// UTILITAIRES DE DATE & HEURE LOCALE
// ============================================================================

/**
 * Crée un objet Date à la date et heure locale sans dérive UTC.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {string} timeStr - 'HH:mm'
 * @returns {Date}
 */
export const createLocalDateTime = (dateStr, timeStr = '00:00') => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

/**
 * Formate les minutes d'une Date au format HH:mm.
 * @param {Date} date
 * @returns {string}
 */
export const formatLocalTime = (date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

/**
 * Ajoute un nombre de jours à un objet Date.
 * @param {Date} date 
 * @param {number} days 
 * @returns {Date} Nouvelle instance
 */
export const addDays = (date, days) => {
    const res = new Date(date);
    res.setDate(res.getDate() + days);
    return res;
};

/**
 * Calcule la durée théorique en heures d'un bloc élémentaire hebdomadaire/mensuel.
 * @param {{ start: { day: number, time: string }, end: { day: number, time: string } }} block
 * @returns {number} Durée en heures
 */
export const calculateBlockDurationHours = (block) => {
    const startDay = block.start.day;
    const endDay = block.end.day;
    const startMin = timeToMinutes(block.start.time);
    const endMin = timeToMinutes(block.end.time);

    let dayDiff = (endDay - startDay + 7) % 7;
    // Si même jour et fin <= début, le bloc fait un cycle complet de 7 jours (168h)
    if (dayDiff === 0 && endMin <= startMin) {
        dayDiff = 7;
    }

    const totalMinutes = dayDiff * 24 * 60 + (endMin - startMin);
    return totalMinutes / 60;
};

// ============================================================================
// VALIDATION DE LA CONFIGURATION
// ============================================================================

/**
 * Valide la structure et la cohérence de continuousRecurrence.
 * @param {Object} config
 */
export const validateRecurrenceConfig = (config) => {
    if (!config || !config.enabled) return;

    const { block, recurrence } = config;

    if (!recurrence || !['weekly', 'monthly', 'cyclical', 'holidays'].includes(recurrence.frequency)) {
        throw new RecurrenceValidationError("La fréquence de récurrence doit être 'weekly', 'monthly', 'cyclical' ou 'holidays'.");
    }

    if (recurrence.frequency === 'holidays') {
        const hc = recurrence.holidays || {};
        if (hc.startTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hc.startTime)) {
            throw new RecurrenceValidationError("L'heure de début des jours fériés doit être au format HH:mm.");
        }
        if (hc.endTime && hc.endTime !== '24:00' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hc.endTime)) {
            throw new RecurrenceValidationError("L'heure de fin des jours fériés doit être au format HH:mm ou 24:00.");
        }
        if (hc.eveStartTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hc.eveStartTime)) {
            throw new RecurrenceValidationError("L'heure de début de veille de fête doit être au format HH:mm.");
        }
        if (hc.nextMorningEndTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hc.nextMorningEndTime)) {
            throw new RecurrenceValidationError("L'heure de fin du lendemain matin de fête doit être au format HH:mm.");
        }
        return;
    }

    if (recurrence.frequency === 'cyclical') {
        const { onDurationHours, offDurationHours } = recurrence.cyclical || {};
        if (!onDurationHours || onDurationHours <= 0) {
            throw new RecurrenceValidationError("Pour un cycle, 'onDurationHours' doit être un nombre strictement positif.");
        }
        if (offDurationHours === undefined || offDurationHours === null || offDurationHours < 0) {
            throw new RecurrenceValidationError("Pour un cycle, 'offDurationHours' doit être supérieur ou égal à 0.");
        }
        return;
    }

    // Validation pour hebdomadaire et mensuel
    if (!block || !block.start || !block.end) {
        throw new RecurrenceValidationError("La définition du bloc (block.start et block.end) est requise.");
    }

    if (typeof block.start.day !== 'number' || block.start.day < 0 || block.start.day > 6) {
        throw new RecurrenceValidationError("block.start.day doit être un entier entre 0 (Dimanche) et 6 (Samedi).");
    }

    if (typeof block.end.day !== 'number' || block.end.day < 0 || block.end.day > 6) {
        throw new RecurrenceValidationError("block.end.day doit être un entier entre 0 (Dimanche) et 6 (Samedi).");
    }

    if (!block.start.time || !block.end.time) {
        throw new RecurrenceValidationError("Les heures de début et de fin du bloc sont requises au format HH:mm.");
    }

    const blockDuration = calculateBlockDurationHours(block);
    if (blockDuration <= 0) {
        throw new RecurrenceValidationError("La durée du bloc continu doit être strictement positive.");
    }

    if (recurrence.frequency === 'weekly') {
        const interval = recurrence.weekly?.interval || 1;
        if (interval < 1) {
            throw new RecurrenceValidationError("L'intervalle hebdomadaire doit être supérieur ou égal à 1.");
        }
        // Si l'intervalle est de 1 semaine (168h), la durée du bloc ne peut pas dépasser 168h
        if (blockDuration > interval * 168) {
            throw new RecurrenceValidationError(`La durée du bloc (${blockDuration}h) dépasse l'intervalle de répétition (${interval * 168}h).`);
        }
    }

    if (recurrence.frequency === 'monthly') {
        const validOccurrences = ['first', 'second', 'third', 'fourth', 'last'];
        const occurrence = recurrence.monthly?.occurrence;
        if (!validOccurrences.includes(occurrence)) {
            throw new RecurrenceValidationError("Pour une récurrence mensuelle, 'occurrence' doit être : 'first', 'second', 'third', 'fourth' ou 'last'.");
        }
    }
};

// ============================================================================
// GÉNÉRATION DES FENÊTRES PAR FRÉQUENCE
// ============================================================================

/**
 * Génère les fenêtres pour une récurrence hebdomadaire.
 */
export const expandWeeklyWindows = (globalStartStr, globalEndStr, block, weeklyConfig = {}) => {
    const interval = weeklyConfig.interval || 1;
    const windows = [];

    const globalStartDate = createLocalDate(globalStartStr);
    const globalEndDate = createLocalDate(globalEndStr);

    // Résolution de la première ancre :
    // Si globalStartDate tombe strictement au milieu du bloc (ex: Samedi ou Dimanche pour un bloc Ven->Lun),
    // on ancre au début de ce bloc pour permettre le clipping contractuel de début.
    // Sinon, on avance au premier block.start.day à venir dans le contrat.
    const startDayOfWeek = globalStartDate.getDay();
    const blockSpanDays = (block.end.day - block.start.day + 7) % 7;
    const offsetFromBlockStart = (startDayOfWeek - block.start.day + 7) % 7;
    const isStrictlyInsideBlock = blockSpanDays > 0 && offsetFromBlockStart > 0 && offsetFromBlockStart < blockSpanDays;

    const firstAnchor = new Date(globalStartDate);
    if (isStrictlyInsideBlock) {
        firstAnchor.setDate(firstAnchor.getDate() - offsetFromBlockStart);
    } else {
        const daysUntilFirstStart = (block.start.day - startDayOfWeek + 7) % 7;
        firstAnchor.setDate(firstAnchor.getDate() + daysUntilFirstStart);
    }

    // Calcul du delta de jours du bloc
    let blockDaySpan = (block.end.day - block.start.day + 7) % 7;
    const startMin = timeToMinutes(block.start.time);
    const endMin = timeToMinutes(block.end.time);
    if (blockDaySpan === 0 && endMin <= startMin) {
        blockDaySpan = 7;
    }

    let currentStart = new Date(firstAnchor);

    // Limite de sécurité : max 5 ans (260 semaines)
    let safety = 0;
    while (safety < 260) {
        const windowStartDateStr = formatLocalDate(currentStart);
        const windowEndDate = addDays(currentStart, blockDaySpan);
        const windowEndDateStr = formatLocalDate(windowEndDate);

        const winStartDT = createLocalDateTime(windowStartDateStr, block.start.time);
        const winEndDT = createLocalDateTime(windowEndDateStr, block.end.time);

        // Si le début de cette fenêtre dépasse largement globalEnd, on s'arrête
        if (currentStart > globalEndDate) {
            break;
        }

        windows.push({
            startDateTime: winStartDT,
            endDateTime: winEndDT,
            startDate: windowStartDateStr,
            startTime: block.start.time,
            endDate: windowEndDateStr,
            endTime: block.end.time
        });

        // Avancer de intervalle * 7 jours
        currentStart.setDate(currentStart.getDate() + (interval * 7));
        safety++;
    }

    return windows;
};

/**
 * Génère les fenêtres pour une récurrence mensuelle ordinale (ex: 1er, 2ème, ..., dernier WE du mois).
 */
export const expandMonthlyWindows = (globalStartStr, globalEndStr, block, monthlyConfig = {}) => {
    const occurrence = monthlyConfig.occurrence || 'first';
    const windows = [];

    const globalStartDate = createLocalDate(globalStartStr);
    const globalEndDate = createLocalDate(globalEndStr);

    let blockDaySpan = (block.end.day - block.start.day + 7) % 7;
    const startMin = timeToMinutes(block.start.time);
    const endMin = timeToMinutes(block.end.time);
    if (blockDaySpan === 0 && endMin <= startMin) {
        blockDaySpan = 7;
    }

    // Itérer de mois en mois
    let currentYear = globalStartDate.getFullYear();
    let currentMonth = globalStartDate.getMonth(); // 0-indexed

    const endYear = globalEndDate.getFullYear();
    const endMonth = globalEndDate.getMonth();

    let safety = 0;
    while ((currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) && safety < 60) {
        // Trouver tous les jours 'block.start.day' du mois en cours
        const targetWeekday = block.start.day;
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const candidateDates = [];

        for (let d = 1; d <= daysInMonth; d++) {
            const dt = new Date(currentYear, currentMonth, d);
            if (dt.getDay() === targetWeekday) {
                candidateDates.push(new Date(dt));
            }
        }

        let selectedStartDate = null;
        if (candidateDates.length > 0) {
            if (occurrence === 'first') {
                selectedStartDate = candidateDates[0];
            } else if (occurrence === 'second' && candidateDates.length >= 2) {
                selectedStartDate = candidateDates[1];
            } else if (occurrence === 'third' && candidateDates.length >= 3) {
                selectedStartDate = candidateDates[2];
            } else if (occurrence === 'fourth' && candidateDates.length >= 4) {
                selectedStartDate = candidateDates[3];
            } else if (occurrence === 'last') {
                selectedStartDate = candidateDates[candidateDates.length - 1];
            }
        }

        if (selectedStartDate) {
            const windowStartDateStr = formatLocalDate(selectedStartDate);
            const windowEndDate = addDays(selectedStartDate, blockDaySpan);
            const windowEndDateStr = formatLocalDate(windowEndDate);

            const winStartDT = createLocalDateTime(windowStartDateStr, block.start.time);
            const winEndDT = createLocalDateTime(windowEndDateStr, block.end.time);

            windows.push({
                startDateTime: winStartDT,
                endDateTime: winEndDT,
                startDate: windowStartDateStr,
                startTime: block.start.time,
                endDate: windowEndDateStr,
                endTime: block.end.time
            });
        }

        // Mois suivant
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        safety++;
    }

    return windows;
};

/**
 * Génère les fenêtres pour une récurrence cyclique en durées absolues (ex: 48h ON / 48h OFF).
 */
export const expandCyclicalWindows = (globalStartStr, globalEndStr, initialStartTime = '08:00', cyclicalConfig = {}) => {
    const onHours = cyclicalConfig.onDurationHours || 48;
    const offHours = cyclicalConfig.offDurationHours || 48;
    const windows = [];

    const globalEndDT = createLocalDateTime(globalEndStr, '23:59:59');
    let cursor = createLocalDateTime(globalStartStr, initialStartTime);

    let safety = 0;
    while (cursor <= globalEndDT && safety < 1000) {
        const winStartDT = new Date(cursor);
        const winEndDT = new Date(winStartDT.getTime() + onHours * 3600 * 1000);

        windows.push({
            startDateTime: winStartDT,
            endDateTime: winEndDT,
            startDate: formatLocalDate(winStartDT),
            startTime: formatLocalTime(winStartDT),
            endDate: formatLocalDate(winEndDT),
            endTime: formatLocalTime(winEndDT)
        });

        // Avancer du cycle complet (ON + OFF)
        cursor = new Date(winEndDT.getTime() + offHours * 3600 * 1000);
        safety++;
    }

    return windows;
};

/**
 * Génère les fenêtres pour une récurrence sur les jours fériés.
 * Permet aux clients de demander une surveillance continue exclusivement lors des jours fériés chômés.
 * 
 * Options supportées :
 * - Couverture H24 (00:00 -> 24:00) sur chaque jour férié.
 * - Horaires personnalisés (ex: 08:00 -> 20:00).
 * - Couverture étendue de fermeture de site : veille au soir (ex: 18:00) -> lendemain matin (ex: 08:00).
 * - Périmètre : tous les fériés de la période ('all') ou sélection spécifique de dates ('custom').
 * 
 * En cas de jours fériés consécutifs ou de débordement veille/lendemain, les fenêtres contiguës
 * ou chevauchantes sont fusionnées pour préserver la continuité opérationnelle du gardiennage.
 * 
 * @param {string} globalStartStr - 'YYYY-MM-DD'
 * @param {string} globalEndStr - 'YYYY-MM-DD'
 * @param {Object} [block] - Bloc temporel par défaut (start: { time }, end: { time })
 * @param {Object} [holidaysConfig] - Configuration spécifique jours fériés
 * @returns {Array} Liste des fenêtres de jours fériés
 */
export const expandHolidayWindows = (globalStartStr, globalEndStr, block = null, holidaysConfig = {}) => {
    const country = holidaysConfig.holidayRegion || holidaysConfig.country || 'FR';
    const scope = holidaysConfig.scope || 'all';
    const selectedDates = Array.isArray(holidaysConfig.selectedDates) ? holidaysConfig.selectedDates : [];

    // 1. Récupérer la liste des jours fériés légaux dans la période contractuelle globale
    const allHolidays = listHolidaysInRange(globalStartStr, globalEndStr, [], 'continuous', country);

    if (!allHolidays || allHolidays.length === 0) {
        return [];
    }

    // 2. Filtrage selon le périmètre (tous les fériés ou sélection personnalisée)
    const targetHolidays = scope === 'custom'
        ? allHolidays.filter(h => selectedDates.includes(h.date))
        : allHolidays;

    if (targetHolidays.length === 0) {
        return [];
    }

    // Heures de début et fin par défaut
    const defaultStartTime = holidaysConfig.startTime || block?.start?.time || '00:00';
    const defaultEndTime = holidaysConfig.endTime || block?.end?.time || '24:00';

    const includeEve = Boolean(holidaysConfig.includeEve);
    const eveStartTime = holidaysConfig.eveStartTime || '18:00';

    const includeNextMorning = Boolean(holidaysConfig.includeNextMorning);
    const nextMorningEndTime = holidaysConfig.nextMorningEndTime || '08:00';

    // 3. Génération des fenêtres brutes pour chaque jour férié
    const rawWindows = targetHolidays.map(h => {
        const holidayDate = createLocalDate(h.date);

        // Date et heure de début
        let winStartDate = h.date;
        let winStartTime = defaultStartTime;
        if (includeEve) {
            const eveDate = addDays(holidayDate, -1);
            winStartDate = formatLocalDate(eveDate);
            winStartTime = eveStartTime;
        }

        // Date et heure de fin
        let winEndDate = h.date;
        let winEndTime = defaultEndTime;
        if (includeNextMorning) {
            const nextDate = addDays(holidayDate, 1);
            winEndDate = formatLocalDate(nextDate);
            winEndTime = nextMorningEndTime;
        }

        const startDateTime = createLocalDateTime(winStartDate, winStartTime);
        const endDateTime = (winEndTime === '24:00')
            ? createLocalDateTime(winEndDate, '24:00')
            : createLocalDateTime(winEndDate, winEndTime);

        return {
            startDateTime,
            endDateTime,
            startDate: winStartDate,
            startTime: winStartTime,
            endDate: winEndDate,
            endTime: winEndTime,
            holidayName: h.name
        };
    });

    // 4. Ordonner chronologiquement
    rawWindows.sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());

    // 5. Fusionner les fenêtres qui se chevauchent ou sont contiguës
    const mergedWindows = [];
    for (const win of rawWindows) {
        if (mergedWindows.length === 0) {
            mergedWindows.push(win);
            continue;
        }

        const prev = mergedWindows[mergedWindows.length - 1];

        // Se chevauchent ou se touchent (ex: prev finit à 24:00 et win commence à 00:00 le lendemain)
        const isTouchingOrOverlapping = win.startDateTime.getTime() <= prev.endDateTime.getTime();

        if (isTouchingOrOverlapping) {
            // Fusionner dans prev
            if (win.endDateTime > prev.endDateTime) {
                prev.endDateTime = win.endDateTime;
                prev.endDate = win.endDate;
                prev.endTime = win.endTime;
            }
            if (win.holidayName && prev.holidayName && !prev.holidayName.includes(win.holidayName)) {
                prev.holidayName = `${prev.holidayName} + ${win.holidayName}`;
            }
        } else {
            mergedWindows.push(win);
        }
    }

    return mergedWindows;
};

// ============================================================================
// CLIPPING CONTRACTUEL & ANTI-CHAUVAUCHEMENT
// ============================================================================

/**
 * Applique l'intersection stricte entre chaque fenêtre et la période contractuelle globale.
 * Règle : [max(w.start, contractStart) -> min(w.end, contractEnd)]
 * 
 * @param {Array} windows - Fenêtres générées
 * @param {string} globalStartStr - 'YYYY-MM-DD'
 * @param {string} globalEndStr - 'YYYY-MM-DD'
 * @param {string} contractStartTime - 'HH:mm'
 * @param {string} contractEndTime - 'HH:mm'
 * @returns {Array} Fenêtres clippées valides
 */
export const clipWindowsToContractBounds = (
    windows,
    globalStartStr,
    globalEndStr,
    contractStartTime = '00:00',
    contractEndTime = '24:00'
) => {
    const contractStartDT = createLocalDateTime(globalStartStr, contractStartTime);
    const contractEndDT = contractEndTime === '24:00'
        ? createLocalDateTime(globalEndStr, '24:00')
        : createLocalDateTime(globalEndStr, contractEndTime);

    const clippedWindows = [];

    windows.forEach(w => {
        // Intersection
        const effStart = new Date(Math.max(w.startDateTime.getTime(), contractStartDT.getTime()));
        const effEnd = new Date(Math.min(w.endDateTime.getTime(), contractEndDT.getTime()));

        // S'il reste une durée strictement positive
        if (effStart < effEnd) {
            const startDate = formatLocalDate(effStart);
            const startTime = (effStart.getTime() <= w.startDateTime.getTime() + 1000)
                ? w.startTime
                : formatLocalTime(effStart);

            let endDate, endTime;
            if (effEnd.getTime() >= w.endDateTime.getTime() - 1000) {
                endDate = w.endDate;
                endTime = w.endTime;
            } else if (contractEndTime === '24:00' && effEnd.getTime() >= contractEndDT.getTime() - 1000) {
                endDate = globalEndStr;
                endTime = '24:00';
            } else if (effEnd.getHours() === 0 && effEnd.getMinutes() === 0) {
                // Minuit (fin du jour précédent à 24:00)
                const prevDay = addDays(effEnd, -1);
                endDate = formatLocalDate(prevDay);
                endTime = '24:00';
            } else {
                endDate = formatLocalDate(effEnd);
                endTime = formatLocalTime(effEnd);
            }

            clippedWindows.push({
                startDateTime: effStart,
                endDateTime: effEnd,
                startDate,
                startTime,
                endDate,
                endTime,
                originalWindow: w
            });
        }
    });

    return clippedWindows;
};

/**
 * Valide universellement l'absence de chevauchement sur les fenêtres réelles générées.
 * @param {Array} windows - Fenêtres ordonnées chronologiquement
 * @throws {RecurrenceOverlapError}
 */
export const validateNoOverlap = (windows) => {
    if (!windows || windows.length <= 1) return;

    const sorted = [...windows].sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];

        if (curr.startDateTime < prev.endDateTime) {
            throw new RecurrenceOverlapError(
                `Deux occurrences de période continue se chevauchent : [${prev.startDate} ${prev.startTime} -> ${prev.endDate} ${prev.endTime}] entre en collision avec [${curr.startDate} ${curr.startTime} -> ${curr.endDate} ${curr.endTime}].`,
                { previousWindow: prev, currentWindow: curr }
            );
        }
    }
};

// ============================================================================
// GÉNÉRATION GLOBALE DES FENÊTRES RÉCURRENTES
// ============================================================================

/**
 * Point d'entrée pour générer l'ensemble des fenêtres continues effectives d'une mission.
 * 
 * @param {string} globalStartStr - Date début contrat (YYYY-MM-DD)
 * @param {string} globalEndStr - Date fin contrat (YYYY-MM-DD)
 * @param {Object} config - Configuration globale incluant continuousRecurrence
 * @returns {Array} Liste des fenêtres continues prêtes pour le calculateur
 */
export const expandRecurringWindows = (globalStartStr, globalEndStr, config = {}) => {
    const { continuousRecurrence, startTime = '00:00', endTime = '24:00' } = config;

    validateRecurrenceConfig(continuousRecurrence);

    if (!continuousRecurrence || !continuousRecurrence.enabled) {
        // Mode continu classique (1 seule fenêtre)
        return [{
            startDate: globalStartStr,
            startTime,
            endDate: globalEndStr,
            endTime,
            startDateTime: createLocalDateTime(globalStartStr, startTime),
            endDateTime: createLocalDateTime(globalEndStr, endTime === '24:00' ? '23:59' : endTime)
        }];
    }

    const { block, recurrence } = continuousRecurrence;
    let rawWindows = [];

    if (recurrence.frequency === 'weekly') {
        rawWindows = expandWeeklyWindows(globalStartStr, globalEndStr, block, recurrence.weekly);
    } else if (recurrence.frequency === 'monthly') {
        rawWindows = expandMonthlyWindows(globalStartStr, globalEndStr, block, recurrence.monthly);
    } else if (recurrence.frequency === 'cyclical') {
        rawWindows = expandCyclicalWindows(globalStartStr, globalEndStr, block?.start?.time || startTime, recurrence.cyclical);
    } else if (recurrence.frequency === 'holidays') {
        rawWindows = expandHolidayWindows(globalStartStr, globalEndStr, block, recurrence.holidays);
    }

    // Clipping strict sur les bornes contractuelles
    const clipped = clipWindowsToContractBounds(rawWindows, globalStartStr, globalEndStr, startTime, endTime);

    // Validation universelle d'absence de chevauchement
    validateNoOverlap(clipped);

    return clipped;
};

// ============================================================================
// FUSION DES JOURNAUX QUOTIDIENS & ORCHESTRATION
// ============================================================================

/**
 * Fusionne les résultats de plusieurs fenêtres continues dans un journal quotidien consolidé.
 * Invariant : Total = Somme des totaux des fenêtres = Somme des buckets.
 * 
 * @param {Array} windowResults - Résultats CalculationResult de chaque fenêtre
 * @returns {{ totalHours: number, buckets: Object, days: Array }}
 */
export const mergeDailyJournals = (windowResults) => {
    let totalHours = 0;
    const globalBuckets = {
        weekdayDay: 0,
        weekdayNight: 0,
        sundayDay: 0,
        sundayNight: 0,
        holidayDay: 0,
        holidayNight: 0,
        sundayHolidayDay: 0,
        sundayHolidayNight: 0
    };

    const daysByDate = new Map();

    windowResults.forEach(res => {
        totalHours += res.totalHours;

        // Agrégation des buckets
        Object.keys(globalBuckets).forEach(k => {
            globalBuckets[k] += (res.buckets[k] || 0);
        });

        // Fusion des jours
        if (Array.isArray(res.days)) {
            res.days.forEach(day => {
                if (!daysByDate.has(day.date)) {
                    // Cloner l'objet jour pour ne pas muter l'original
                    daysByDate.set(day.date, {
                        ...day,
                        intervals: [...day.intervals],
                        buckets: { ...day.buckets }
                    });
                } else {
                    // Jour déjà existant (par exemple un jour de transition entre deux fenêtres contiguës)
                    const existing = daysByDate.get(day.date);
                    existing.totalHours += day.totalHours;
                    existing.intervals.push(...day.intervals);
                    Object.keys(existing.buckets).forEach(k => {
                        existing.buckets[k] += (day.buckets[k] || 0);
                    });
                }
            });
        }
    });

    // Ordonner chronologiquement les jours
    const mergedDays = Array.from(daysByDate.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
        totalHours,
        buckets: globalBuckets,
        days: mergedDays
    };
};

/**
 * Calcule une mission en période continue avec récurrence complète.
 * 
 * @param {Object} fullConfig - Configuration de la mission
 * @returns {Object} Résultat consolidé avec journal fusionné et liste des fenêtres
 */
export const calculateRecurringContinuousMission = (fullConfig) => {
    const { startDate, endDate, continuousRecurrence } = fullConfig;

    // 1. Si récurrence continue désactivée, calcul continu standard unitaire
    if (!continuousRecurrence || !continuousRecurrence.enabled) {
        return calculateMissionHoursWithJournal({
            ...fullConfig,
            mode: 'continuous'
        });
    }

    // 2. Génération, clipping et validation des fenêtres
    const windows = expandRecurringWindows(startDate, endDate, fullConfig);

    if (windows.length === 0) {
        return {
            totalHours: 0,
            buckets: {
                weekdayDay: 0,
                weekdayNight: 0,
                sundayDay: 0,
                sundayNight: 0,
                holidayDay: 0,
                holidayNight: 0,
                sundayHolidayDay: 0,
                sundayHolidayNight: 0
            },
            days: [],
            windows: [],
            windowCount: 0
        };
    }

    // 3. Évaluation unitaire de chaque fenêtre continue via le moteur existant
    const holidayRegion = fullConfig.holidayRegion || fullConfig.continuousRecurrence?.recurrence?.holidays?.holidayRegion || 'FR';
    const windowResults = windows.map(w => {
        return calculateMissionHoursWithJournal({
            ...fullConfig,
            mode: 'continuous',
            startDate: w.startDate,
            startTime: w.startTime,
            endDate: w.endDate,
            endTime: w.endTime,
            holidayRegion
        });
    });

    // 4. Fusion déterministe
    const merged = mergeDailyJournals(windowResults);

    return {
        ...merged,
        mode: 'continuous',
        windows,
        windowCount: windows.length,
        dateRange: {
            start: startDate,
            end: endDate
        }
    };
};
