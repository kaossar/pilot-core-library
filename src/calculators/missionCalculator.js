/**
 * Calculateur de Mission - Module de Logique Pure
 * 
 * Ce module contient toute la logique de calcul de base pour les heures de mission,
 * complètement séparé des composants React pour faciliter les tests et la maintenance.
 * 
 * Architecture : Modèle de Journal Quotidien
 * - Chaque calcul produit une répartition quotidienne (journal)
 * - Le total est la somme des totaux quotidiens
 * - Transparent, auditable, exportable
 * 
 * @module missionCalculator
 */

import Holidays from 'date-holidays';

const hd = new Holidays('FR');

/**
 * Liste des zones géographiques supportées pour les jours fériés légaux.
 * Conçu pour durer 10+ ans selon les principes Clean Architecture.
 */
export const HOLIDAY_REGIONS = [
    { value: 'FR',    label: 'France Métropolitaine (11 jours légaux)' },
    { value: 'FR-57', label: 'Alsace-Moselle (Moselle 57 - Vendredi Saint & St-Étienne)' },
    { value: 'FR-67', label: 'Alsace-Moselle (Bas-Rhin 67 - Vendredi Saint & St-Étienne)' },
    { value: 'FR-68', label: 'Alsace-Moselle (Haut-Rhin 68 - Vendredi Saint & St-Étienne)' },
    { value: 'FR-GP', label: 'Guadeloupe (Abolition 27 mai)' },
    { value: 'FR-MQ', label: 'Martinique (Abolition 22 mai)' },
    { value: 'FR-GF', label: 'Guyane (Abolition 10 juin)' },
    { value: 'FR-RE', label: 'La Réunion (Fête liberté 20 déc)' },
    { value: 'FR-YT', label: 'Mayotte (Abolition 27 avril)' },
    { value: 'BE',    label: 'Belgique' },
    { value: 'LU',    label: 'Luxembourg' },
    { value: 'CH',    label: 'Suisse' },
    { value: 'MC',    label: 'Monaco' }
];

const holidaysInstanceCache = new Map();

/**
 * Résout ou crée une instance Holidays pour un pays ou une région donnée.
 * Supporte les notations : 'FR', 'FR-57' (Alsace-Moselle), 'FR-GP', 'BE', 'LU', etc.
 * 
 * @param {string|Object} [country='FR'] - Code ISO ou chaîne composée (ex: 'FR-57')
 * @param {string} [state=null] - Code de région/département optionnel
 * @returns {Holidays} Instance configurée
 */
export const getHolidaysInstance = (country = 'FR', state = null) => {
    let c = 'FR';
    let s = state;

    if (typeof country === 'object' && country !== null) {
        c = country.country || 'FR';
        s = country.state || state || null;
    } else if (typeof country === 'string') {
        if (country.includes('-')) {
            const parts = country.split('-');
            c = parts[0];
            s = parts[1];
        } else {
            c = country;
        }
    }

    // Instance par défaut sans région
    if (c === 'FR' && !s) {
        return hd;
    }

    const cacheKey = `${c}_${s || ''}`;
    if (!holidaysInstanceCache.has(cacheKey)) {
        holidaysInstanceCache.set(cacheKey, s ? new Holidays(c, s) : new Holidays(c));
    }
    return holidaysInstanceCache.get(cacheKey);
};

/**
 * Classification des catégories d'heures
 * @typedef {'DAY_WEEK'|'NIGHT_WEEK'|'DAY_SUNDAY'|'NIGHT_SUNDAY'|'DAY_HOLIDAY'|'NIGHT_HOLIDAY'|'DAY_SUN_HOL'|'NIGHT_SUN_HOL'} HourCategory
 */

/**
 * Intervalle de temps avec sa catégorie classifiée
 * @typedef {Object} TimeInterval
 * @property {string} start - Heure de début (HH:mm)
 * @property {string} end - Heure de fin (HH:mm)
 * @property {HourCategory} category - Catégorie de l'heure
 * @property {number} hours - Durée en heures
 */

/**
 * Détail quotidien du calcul avec répartition complète
 * @typedef {Object} CalculationDayDetail
 * @property {string} date - Date (YYYY-MM-DD)
 * @property {number} weekday - Jour de la semaine (0=Dimanche, 1=Lundi, ...)
 * @property {boolean} isWeekend - Vrai si Samedi ou Dimanche
 * @property {boolean} isSunday - Vrai si Dimanche
 * @property {boolean} isHoliday - Vrai si jour férié en France
 * @property {TimeInterval[]} intervals - Intervalles de temps pour cette journée
 * @property {HourBuckets} buckets - Agrégation des heures par catégorie pour cette journée
 * @property {number} totalHours - Total des heures pour cette journée
 */

/**
 * Objet de configuration pour les calculs de mission
 * @typedef {Object} CalculationConfig
 * @property {string} mode - Mode de calcul : 'daily' (quotidien) | 'continuous' (continu)
 * @property {string} startDate - Date de début (YYYY-MM-DD)
 * @property {string} endDate - Date de fin (YYYY-MM-DD)
 * @property {string} startTime - Heure de début (HH:mm)
 * @property {string} endTime - Heure de fin (HH:mm)
 * @property {number[]} selectedDays - Tableau des indices des jours sélectionnés [0-6] (0=Dimanche)
 * @property {string} nightShiftStart - Heure de début de nuit (HH:mm)
 * @property {string} nightShiftEnd - Heure de fin de nuit (HH:mm)
 * @property {boolean} holidayH24 - Forcer 24h les jours fériés
 * @property {boolean} weekendH24 - Forcer 24h les week-ends
 * @property {boolean} useCustomRecurrence - Utiliser un modèle de récurrence personnalisé
 * @property {Object} recurrencePattern - Modèle de récurrence {frequency, interval}
 * @property {boolean} useMultiSlots - Utiliser des créneaux horaires multiples
 * @property {Array<{start: string, end: string}>} timeSlots - Tableau des créneaux horaires
 */

/**
 * Résultat des seaux d'heures (buckets)
 * @typedef {Object} HourBuckets
 * @property {number} weekdayDay - Heures de jour en semaine
 * @property {number} weekdayNight - Heures de nuit en semaine
 * @property {number} sundayDay - Heures de jour le dimanche
 * @property {number} sundayNight - Heures de nuit le dimanche
 * @property {number} holidayDay - Heures de jour férié
 * @property {number} holidayNight - Heures de nuit les jours fériés
 * @property {number} sundayHolidayDay - Heures de jour le dimanche + férié
 * @property {number} sundayHolidayNight - Heures de nuit le dimanche + férié
 */

/**
 * Résultat de calcul amélioré avec le journal quotidien
 * @typedef {Object} CalculationResult
 * @property {HourBuckets} buckets - Répartition des heures par type (agrégation totale)
 * @property {number} totalHours - Total des heures calculées
 * @property {CalculationDayDetail[]} [days] - Journal détaillé quotidien (optionnel, nouvelle architecture)
 * @property {string} [mode] - Mode de calcul utilisé
 * @property {Object} [dateRange] - Plage de dates {start, end}
 */

/**
 * Format daily journal as human-readable text
 * @param {CalculationDayDetail[]} days - Array of day details from journal
 * @returns {string} Multi-line text description
 */
// ============================================================================
// FONCTIONS UTILITAIRES DE DATES (Sécurité des fuseaux horaires)
// ============================================================================

/**
 * Crée un objet Date défini au minuit local à partir d'une chaîne YYYY-MM-DD
 * Cela évite les problèmes de conversion UTC avec new Date('YYYY-MM-DD')
 * 
 * @param {string} dateStr - Chaîne de date (YYYY-MM-DD)
 * @returns {Date} Objet Date à 00:00:00 heure locale
 */
export const createLocalDate = (dateStr) => {
    if (!dateStr) return new Date();
    // Accepte un objet Date directement (passage depuis le frontend)
    if (dateStr instanceof Date) {
        // Cloner en local pour éviter les effets de bord, forcer minuit local
        return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
    }
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

/**
 * Formate un objet Date en chaîne YYYY-MM-DD en utilisant l'heure locale
 * 
 * @param {Date} date - Objet Date
 * @returns {string} Chaîne YYYY-MM-DD
 */
export const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Formate un nombre d'heures en chaîne de caractères avec 1 ou 2 décimales selon le cas.
 * - Garde 1 décimale si c'est un entier ou une demi-heure (ex: 4.0, 11.5)
 * - Utilise 2 décimales pour les quarts d'heure (ex: 11.75, 11.25)
 * 
 * @param {number} h - Nombre d'heures
 * @returns {string} Heures formatées
 */
export const formatHours = (h) => {
    if (h % 0.5 === 0) {
        return h.toFixed(1);
    }
    return h.toFixed(2);
};

/**
 * Formate le journal quotidien en texte lisible par l'homme
 * @param {CalculationDayDetail[]} days - Tableau de détails quotidiens du journal
 * @param {Object} [options] - Options de formatage
 * @param {number} [options.agents] - Nombre d'agents
 * @param {string} [options.qualification] - Nom de la qualification
 * @returns {string} Description textuelle sur plusieurs lignes
 */
export const formatDailyJournalAsText = (days, options = {}) => {
    if (!days || days.length === 0) return '';

    // Options par défaut
    const {
        agents = 1,
        qualification = '',
        // Sous-totaux mensuels : 'auto' | true | false
        // 'auto' = activé seulement si la mission couvre plus d'un mois calendaire
        monthlySubtotals = 'auto',
        // Taux horaire (€/h) pour afficher le montant mensuel — conditionnel si > 0
        hourlyRate = 0,
        // Tarif lissé : si true, les majorations sont incluses dans le taux de base
        isLissee = false,
    } = options;

    // --- Détermination de l'activation des sous-totaux ---
    // En mode 'auto', on active si la mission couvre au moins 2 mois calendaires distincts
    const activeDays = days.filter(d => d.totalHours > 0);
    let showSubtotals = monthlySubtotals === true;
    if (monthlySubtotals === 'auto' && activeDays.length >= 2) {
        const firstMonth = activeDays[0].date.slice(0, 7); // YYYY-MM
        showSubtotals = activeDays.some(d => d.date.slice(0, 7) !== firstMonth);
    }

    const lines = [];
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    // Noms des mois en français pour les lignes de cumul
    const MOIS_FR = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    // Séparateur visuel réutilisable
    const SEP = '─'.repeat(57);

    // --- Accumulateur mensuel ---
    // Structure : buckets cumulés + total heures + agents (pondéré)
    const EMPTY_MONTHLY = () => ({
        weekdayDay: 0, weekdayNight: 0,
        sundayDay: 0,  sundayNight: 0,
        holidayDay: 0, holidayNight: 0,
        sundayHolidayDay: 0, sundayHolidayNight: 0,
        totalHours: 0,
        label: '',        // ex: 'Janvier 2026'
        monthKey: '',     // ex: '2026-01'
    });

    let monthly = EMPTY_MONTHLY();
    let prevMonthKey = '';

    /**
     * Génère et insère la ligne de cumul mensuel dans `lines`.
     * Appelé à chaque changement de mois et en fin de journal.
     *
     * @param {object} acc - Accumulateur du mois terminé
     */
    const flushMonthlySubtotal = (acc) => {
        if (!acc.monthKey || acc.totalHours === 0) return;

        lines.push('');
        lines.push(`${SEP}`);
        lines.push(`    CUMUL ${acc.label.toUpperCase()}`);
        lines.push(`${SEP}`);

        // Affichage de chaque bucket (si non nul)
        if (acc.weekdayDay    > 0) lines.push(`  H Jour semaine    : ${formatHours(acc.weekdayDay).padStart(8)} H`);
        if (acc.weekdayNight  > 0) lines.push(`  H Nuit semaine    : ${formatHours(acc.weekdayNight).padStart(8)} H`);
        if (acc.sundayDay     > 0) lines.push(`  H Jour Dimanche   : ${formatHours(acc.sundayDay).padStart(8)} H`);
        if (acc.sundayNight   > 0) lines.push(`  H Nuit Dimanche   : ${formatHours(acc.sundayNight).padStart(8)} H`);
        if (acc.holidayDay    > 0) lines.push(`  H Jour Férié      : ${formatHours(acc.holidayDay).padStart(8)} H  ★`);
        if (acc.holidayNight  > 0) lines.push(`  H Nuit Férié      : ${formatHours(acc.holidayNight).padStart(8)} H  ★`);
        if (acc.sundayHolidayDay   > 0) lines.push(`  H Jour Dim+Férié : ${formatHours(acc.sundayHolidayDay).padStart(8)} H  ★`);
        if (acc.sundayHolidayNight > 0) lines.push(`  H Nuit Dim+Férié : ${formatHours(acc.sundayHolidayNight).padStart(8)} H  ★`);

        lines.push(`  ${'─'.repeat(43)}`);
        lines.push(`  TOTAL DU MOIS     : ${formatHours(acc.totalHours).padStart(8)} H`);

        // Montant € mensuel (conditionnel : affiché seulement si taux > 0)
        if (hourlyRate > 0) {
            // Calcul simplifié : si tarif lissé, taux unique ; sinon taux de base sur les H semaine
            // Note : la ventilation détaillée avec majorations est gérée par calcProfitability
            // Ici, on affiche une estimation basée sur le taux de base × total heures
            const montantBrut = acc.totalHours * hourlyRate;
            const montantStr = montantBrut.toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            lines.push(`  MONTANT DU MOIS   : ${montantStr.padStart(11)} € HT`);
        }

        lines.push(`${SEP}`);
        lines.push('');
    };

    days.forEach(day => {
        if (day.totalHours === 0) return; // Ignorer les jours sans heures

        const currentAgents = typeof day.agents === 'number' ? day.agents : agents;
        const currentQualification = typeof day.qualification === 'string' ? day.qualification : qualification;
        const agentPrefix = currentQualification ? `${currentAgents}x ${currentQualification}` : '';

        // Création de la date locale sécurisée
        const date = createLocalDate(day.date);
        const dayName = dayNames[date.getDay()];
        const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // --- Détection du changement de mois (pour les sous-totaux) ---
        const currentMonthKey = day.date.slice(0, 7); // YYYY-MM
        if (showSubtotals && prevMonthKey && currentMonthKey !== prevMonthKey) {
            // Fin du mois précédent → injecter le sous-total
            flushMonthlySubtotal(monthly);
            // Réinitialiser l'accumulateur pour le nouveau mois
            monthly = EMPTY_MONTHLY();
        }

        // Initialiser le label du mois courant si nécessaire
        if (showSubtotals && !monthly.monthKey) {
            monthly.monthKey = currentMonthKey;
            const year = parseInt(currentMonthKey.slice(0, 4), 10);
            const month = parseInt(currentMonthKey.slice(5, 7), 10) - 1;
            monthly.label = `${MOIS_FR[month]} ${year}`;
        }
        prevMonthKey = currentMonthKey;

        // --- Reconstruction des plages horaires réelles ---
        // Problème : les intervalles internes sont fragmentés par les frontières jour/nuit.
        // Il faut fusionner les intervalles CONTIGUS pour retrouver les créneaux originaux.
        // Un gap entre deux intervalles = deux créneaux distincts (ex: 00:00-08:00 ; 16:00-24:00).
        let timeRange = '';
        if (day.intervals && day.intervals.length > 0) {
            const ranges = [];
            let currentStart = day.intervals[0].start;
            let currentEnd = day.intervals[0].end;

            for (let i = 1; i < day.intervals.length; i++) {
                const next = day.intervals[i];

                // Deux intervalles sont contigus si la fin de l'un = le début du suivant.
                // Cas spécial : '24:00' (fin de journée) et '00:00' (début de nuit recovery)
                // sont considérés contigus uniquement quand c'est un enchaînement sans gap.
                const isContinuous = (currentEnd === next.start) ||
                    (currentEnd === '24:00' && next.start === '00:00');

                if (isContinuous) {
                    // Fusionner : prolonger le créneau courant
                    currentEnd = next.end;
                } else {
                    // Gap détecté → sauvegarder le créneau courant et en démarrer un nouveau
                    ranges.push(`${currentStart}-${currentEnd}`);
                    currentStart = next.start;
                    currentEnd = next.end;
                }
            }
            // Sauvegarder le dernier créneau
            ranges.push(`${currentStart}-${currentEnd}`);

            timeRange = `[${ranges.join(' ; ')}]`;
        }

        // --- Construction des parties heures par catégorie ---
        const parts = [];

        // Heures semaine normales
        if (day.buckets.weekdayDay > 0)
            parts.push(`${formatHours(day.buckets.weekdayDay * currentAgents)} h jour`);
        if (day.buckets.weekdayNight > 0)
            parts.push(`${formatHours(day.buckets.weekdayNight * currentAgents)} h nuit`);

        // Heures dimanche
        if (day.buckets.sundayDay > 0)
            parts.push(`${formatHours(day.buckets.sundayDay * currentAgents)} h jour (dim)`);
        if (day.buckets.sundayNight > 0)
            parts.push(`${formatHours(day.buckets.sundayNight * currentAgents)} h nuit (dim)`);

        // Heures jours fériés — distinction visuelle claire
        if (day.buckets.holidayDay > 0)
            parts.push(`${formatHours(day.buckets.holidayDay * currentAgents)} h jour (férié)`);
        if (day.buckets.holidayNight > 0)
            parts.push(`${formatHours(day.buckets.holidayNight * currentAgents)} h nuit (férié)`);

        // Heures dimanche + férié
        if (day.buckets.sundayHolidayDay > 0)
            parts.push(`${formatHours(day.buckets.sundayHolidayDay * currentAgents)} h jour (dim+férié)`);
        if (day.buckets.sundayHolidayNight > 0)
            parts.push(`${formatHours(day.buckets.sundayHolidayNight * currentAgents)} h nuit (dim+férié)`);

        if (parts.length > 0) {
            // Suffixe indiquant si c'est un jour férié
            const holidaySuffix = day.isHoliday ? ' ★ FÉRIÉ' : '';
            const prefix = agentPrefix ? `${agentPrefix} ` : '';
            lines.push(`${dateStr} (${dayName}${holidaySuffix}) ${prefix}${timeRange} : ${parts.join(', ')}`);
        }

        // --- Accumulation mensuelle (après avoir poussé la ligne du jour) ---
        if (showSubtotals) {
            const b = day.buckets;
            monthly.weekdayDay         += (b.weekdayDay         || 0) * currentAgents;
            monthly.weekdayNight       += (b.weekdayNight       || 0) * currentAgents;
            monthly.sundayDay          += (b.sundayDay          || 0) * currentAgents;
            monthly.sundayNight        += (b.sundayNight        || 0) * currentAgents;
            monthly.holidayDay         += (b.holidayDay         || 0) * currentAgents;
            monthly.holidayNight       += (b.holidayNight       || 0) * currentAgents;
            monthly.sundayHolidayDay   += (b.sundayHolidayDay   || 0) * currentAgents;
            monthly.sundayHolidayNight += (b.sundayHolidayNight || 0) * currentAgents;
            monthly.totalHours         += day.totalHours * currentAgents;
        }
    });

    // --- Flush du dernier mois après la fin de la boucle ---
    if (showSubtotals) {
        flushMonthlySubtotal(monthly);
    }

    return lines.join('\n');
};


/**
 * Construit le cache des jours fériés officiels pour une plage de dates.
 * IMPORTANT : on filtre strictement sur type === 'public' pour ne retenir que
 * les jours fériés légaux ouvrant droit aux majorations conventionnelles.
 * (ex France : 11 jours, exclut Fête des Mères, Pentecôte/dimanche, etc.)
 *
 * @param {Date} start       - Date de début
 * @param {Date} end         - Date de fin
 * @param {string} [country] - Code pays ISO ou région (ex: 'FR', 'FR-57', 'BE')
 * @param {string} [state] - Code région optionnel
 * @returns {Map<string, boolean>} Map date→true pour chaque jour férié public
 */
export const buildHolidayCache = (start, end, country = 'FR', state = null) => {
    const cache = new Map();
    const hdInstance = getHolidaysInstance(country, state);

    // Cloner pour ne pas modifier l'original
    let curr = new Date(start);
    curr.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);

    let safety = 0;
    while (curr <= last && safety < 366 * 5) {
        const results = hdInstance.isHoliday(curr);
        // Seuls les jours de type 'public' sont des jours fériés légaux ouvrant droit aux majorations
        const isPublicHoliday = Array.isArray(results) && results.some(h => h.type === 'public');
        cache.set(curr.toDateString(), isPublicHoliday);
        curr.setDate(curr.getDate() + 1);
        safety++;
    }

    return cache;
};

/**
 * Liste les jours fériés présents dans une période avec leurs métadonnées.
 * Fonction purement additive — aucun effet de bord sur le pipeline de calcul.
 *
 * Retourne pour chaque jour férié :
 *   - date        : string YYYY-MM-DD
 *   - name        : nom du jour férié
 *   - dateKey     : clé unique (date string locale) pour la Map d'exclusion
 *   - isSunday    : si ce jour est un dimanche
 *   - isWeekend   : si ce jour est un samedi ou dimanche
 *   - weekday     : indice du jour (0=Dimanche)
 *   - isCoveredByPlanning : si le planning (selectedDays) inclut ce jour
 *
 * @param {string}   startDate    - Date de début YYYY-MM-DD
 * @param {string}   endDate      - Date de fin YYYY-MM-DD
 * @param {number[]} selectedDays - Jours du planning [0-6]
 * @param {string}   [mode]       - Mode de calcul ('daily' | 'continuous')
 * @param {string}   [country]    - Code pays ISO ou région (ex: 'FR', 'FR-57', 'BE')
 * @param {string}   [state]      - Code région optionnel
 * @returns {Array<Object>} Liste des jours fériés avec métadonnées
 */
export const listHolidaysInRange = (startDate, endDate, selectedDays = [], mode = 'daily', country = 'FR', state = null) => {
    if (!startDate || !endDate) return [];

    const hdInstance = getHolidaysInstance(country, state);
    const holidays = [];

    let curr = createLocalDate(startDate);
    const last = createLocalDate(endDate);
    // Sécurité : limiter à 5 ans maximum
    let safety = 0;

    while (curr <= last && safety < 366 * 5) {
        const results = hdInstance.isHoliday(curr);
        const publicHoliday = Array.isArray(results) && results.find(h => h.type === 'public');

        if (publicHoliday) {
            const weekday = curr.getDay();
            const dateStr = formatLocalDate(curr);

            holidays.push({
                // Identifiant unique stable (YYYY-MM-DD) pour la sérialisation en BDD
                date: dateStr,
                // Clé interne pour la Map holidayCache (format toDateString)
                dateKey: curr.toDateString(),
                // Nom officiel du jour férié
                name: publicHoliday.name,
                // Métadonnées calendaires
                weekday,
                isSunday: weekday === 0,
                isWeekend: weekday === 0 || weekday === 6,
                // Indique si le planning habituel couvre ce jour
                // En mode continu, tous les jours sont couverts par définition
                isCoveredByPlanning: mode === 'continuous' || selectedDays.includes(weekday)
            });
        }

        curr.setDate(curr.getDate() + 1);
        safety++;
    }

    return holidays;
};


// ============================================================================
// TIME UTILITY FUNCTIONS (Daily Journal Support)
// ============================================================================

/**
 * Convertit une chaîne de temps en minutes depuis minuit
 * Représentation interne : travaille en minutes pour la précision
 * 
 * @param {string} time - Heure au format HH:mm
 * @returns {number} Minutes depuis minuit
 * @example
 * timeToMinutes('14:30') // => 870
 * timeToMinutes('00:00') // => 0
 */
export const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

/**
 * Convertit des minutes depuis minuit en chaîne de temps
 * 
 * @param {number} minutes - Minutes depuis minuit
 * @returns {string} Heure au format HH:mm
 * @example
 * minutesToTime(870) // => '14:30'
 * minutesToTime(0) // => '00:00'
 */
export const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * Calcule les minutes dans l'intervalle [start, end)
 * L'intervalle est semi-ouvert : début inclus, fin exclue
 * 
 * @param {string} start - Heure de début (HH:mm), incluse
 * @param {string} end - Heure de fin (HH:mm), exclue
 * @returns {number} Minutes dans l'intervalle
 * @example
 * calculateMinutesInInterval('14:00', '18:00') // => 240 (4 heures)
 * calculateMinutesInInterval('22:00', '06:00') // => 480 (8 heures, nuit)
 */
export const calculateMinutesInInterval = (start, end) => {
    let startMin = timeToMinutes(start);
    let endMin = timeToMinutes(end);

    // Handle overnight intervals
    if (endMin <= startMin) {
        endMin += 24 * 60; // Add 24 hours
    }

    return endMin - startMin;
};

/**
 * Construit un tableau de dates civiles dans la plage [startDate, endDate]
 * Retourne toujours les dates dans l'ordre chronologique
 * 
 * @param {string} startDate - Date de début (YYYY-MM-DD)
 * @param {string} endDate - Date de fin (YYYY-MM-DD)
 * @returns {string[]} Tableau de chaînes de dates (YYYY-MM-DD)
 * @example
 * buildDateRange('2024-01-01', '2024-01-03')
 * // => ['2024-01-01', '2024-01-02', '2024-01-03']
 */
export const buildDateRange = (startDate, endDate) => {
    const dates = [];
    const start = createLocalDate(startDate);
    const end = createLocalDate(endDate);

    // Ensure chronological order
    if (end < start) {
        return [];
    }

    const current = new Date(start);
    while (current <= end) {
        dates.push(formatLocalDate(current));
        current.setDate(current.getDate() + 1);
    }

    return dates;
};

/**
 * Construit les limites temporelles pour une journée basées sur les règles métiers
 * Ne divise que sur des limites significatives (pas de créneaux fixes de 30min)
 * 
 * @param {string} dayStart - Heure de début de la journée (HH:mm)
 * @param {string} dayEnd - Heure de fin de la journée (HH:mm)
 * @param {string} nightStart - Début du travail de nuit (HH:mm)
 * @param {string} nightEnd - Fin du travail de nuit (HH:mm)
 * @returns {string[]} Tableau trié des limites temporelles uniques
 * @example
 * buildTimeBoundaries('08:00', '20:00', '21:00', '06:00')
 * // => ['00:00', '06:00', '08:00', '20:00', '21:00', '23:59']
 */
export const buildTimeBoundaries = (dayStart, dayEnd, nightStart, nightEnd) => {
    const boundaries = new Set([
        dayStart,
        dayEnd,
        nightStart,
        nightEnd,
        '00:00',
        '24:00'
    ]);

    return Array.from(boundaries).sort((a, b) => {
        return timeToMinutes(a) - timeToMinutes(b);
    });
};

// ============================================================================
// FONCTIONS DE CLASSIFICATION EXISTANTES
// ============================================================================


// ============================================================================
// FONCTIONS DE CALCUL QUOTIDIEN (Logique Principale du Journal Quotidien)
// ============================================================================

/**
 * Crée un détail de journée vide pour les jours non sélectionnés ou sans travail
 * Définit explicitement tous les champs pour maintenir une structure cohérente
 * 
 * @param {string} date - Date (YYYY-MM-DD)
 * @param {number} weekday - Jour de la semaine (0=Dimanche)
 * @param {boolean} isHoliday - Est un jour férié public
 * @param {boolean} isSunday - Est un dimanche
 * @param {boolean} isWeekend - Est un week-end (Samedi ou Dimanche)
 * @returns {CalculationDayDetail} Détail de journée vide
 */
export const createEmptyDay = (date, weekday, isHoliday, isSunday, isWeekend) => {
    return {
        date,
        weekday,
        isWeekend,
        isSunday,
        isHoliday,
        intervals: [], // Explicitly empty
        buckets: {     // All zeros
            weekdayDay: 0,
            weekdayNight: 0,
            sundayDay: 0,
            sundayNight: 0,
            holidayDay: 0,
            holidayNight: 0,
            sundayHolidayDay: 0,
            sundayHolidayNight: 0
        },
        totalHours: 0  // Zero explicit
    };
};

/**
 * Classe une heure (HH:mm) dans une catégorie d'heures basée sur le type de jour et les règles de nuit
 * CRITIQUE : Ne regarde que l'heure, PAS l'origine de la date (pour le support des nuits)
 * 
 * @param {string} time - Chaîne de temps (HH:mm)
 * @param {boolean} isHoliday - Est un jour férié public
 * @param {boolean} isSunday - Est un dimanche
 * @param {number} nightStartH - Heure de début de nuit (0-23)
 * @param {number} nightEndH - Heure de fin de nuit (0-23)
 * @returns {HourCategory} Catégorie de l'heure
 */
export const classifyTimeCategory = (time, { isHoliday, isSunday, nightStartH, nightEndH }) => {
    const hour = parseInt(time.split(':')[0], 10);

    // Night classification: hour >= nightStart OR hour < nightEnd
    // Example: 21:00-06:00 → night if h>=21 OR h<6
    const isNight = (hour >= nightStartH) || (hour < nightEndH);

    // Day type classification
    if (isSunday && isHoliday) {
        return isNight ? 'sundayHolidayNight' : 'sundayHolidayDay';
    } else if (isHoliday) {
        return isNight ? 'holidayNight' : 'holidayDay';
    } else if (isSunday) {
        return isNight ? 'sundayNight' : 'sundayDay';
    } else {
        return isNight ? 'weekdayNight' : 'weekdayDay';
    }
};

/**
 * Divise la période de travail d'une journée en intervalles de temps catégorisés
 * Utilise les limites des règles métiers (pas de créneaux fixes de 30min)
 * 
 * @param {string} dayStart - Heure de début de travail de la journée (HH:mm)
 * @param {string} dayEnd - Heure de fin de travail de la journée (HH:mm)
 * @param {Object} options - Options de classification
 * @param {boolean} options.isHoliday - Est un jour férié public
 * @param {boolean} options.isSunday - Est un dimanche
 * @param {string} options.nightShiftStart - Début du travail de nuit (HH:mm)
 * @param {string} options.nightShiftEnd - Fin du travail de nuit (HH:mm)
 * @returns {TimeInterval[]} Tableau des intervalles de temps catégorisés
 */
export const splitDayIntoIntervals = (dayStart, dayEnd, { isHoliday, isSunday, nightShiftStart, nightShiftEnd }) => {
    const intervals = [];
    const nightStartH = parseInt(nightShiftStart.split(':')[0], 10);
    const nightEndH = parseInt(nightShiftEnd.split(':')[0], 10);

    // Build time boundaries for this day
    const boundaries = buildTimeBoundaries(dayStart, dayEnd, nightShiftStart, nightShiftEnd);

    // Filter boundaries to only those within [dayStart, dayEnd]
    const startMin = timeToMinutes(dayStart);
    const endMin = timeToMinutes(dayEnd);
    const adjustedEndMin = endMin <= startMin ? endMin + 24 * 60 : endMin;

    const relevantBoundaries = boundaries.filter(b => {
        const bMin = timeToMinutes(b);
        const adjustedBMin = (bMin < startMin && endMin <= startMin) ? bMin + 24 * 60 : bMin;
        return adjustedBMin >= startMin && adjustedBMin <= adjustedEndMin;
    });

    // Always ensure start and end are included
    if (!relevantBoundaries.includes(dayStart)) {
        relevantBoundaries.unshift(dayStart);
    }
    if (!relevantBoundaries.includes(dayEnd)) {
        relevantBoundaries.push(dayEnd);
    }

    // Sort boundaries chronologically
    relevantBoundaries.sort((a, b) => {
        let aMin = timeToMinutes(a);
        let bMin = timeToMinutes(b);

        // Adjust for overnight
        if (aMin < startMin && endMin <= startMin) aMin += 24 * 60;
        if (bMin < startMin && endMin <= startMin) bMin += 24 * 60;

        return aMin - bMin;
    });

    // Deduplicate boundaries (remove consecutive duplicates that map to the same effective time)
    // This is critical because 00:00 and 24:00 can both appear and map to the same effective time in overnight shifts
    const uniqueBoundaries = [];
    if (relevantBoundaries.length > 0) {
        uniqueBoundaries.push(relevantBoundaries[0]);
        for (let i = 1; i < relevantBoundaries.length; i++) {
            const current = relevantBoundaries[i];
            const prev = uniqueBoundaries[uniqueBoundaries.length - 1];

            let curMin = timeToMinutes(current);
            let prevMin = timeToMinutes(prev);

            // Apply same adjustment
            if (curMin < startMin && endMin <= startMin) curMin += 24 * 60;
            if (prevMin < startMin && endMin <= startMin) prevMin += 24 * 60;

            if (curMin !== prevMin) {
                uniqueBoundaries.push(current);
            }
        }
    }

    // Use uniqueBoundaries for interval generation
    const boundariesToUse = uniqueBoundaries;

    // Build intervals between consecutive boundaries
    for (let i = 0; i < boundariesToUse.length - 1; i++) {
        const start = boundariesToUse[i];
        const end = boundariesToUse[i + 1];

        // Calculate duration
        const minutes = calculateMinutesInInterval(start, end);
        const hours = minutes / 60;

        // Classify this interval (use start time for classification)
        const category = classifyTimeCategory(start, { isHoliday, isSunday, nightStartH, nightEndH });

        intervals.push({
            start,
            end,
            category,
            hours
        });
    }

    return intervals;
};

/**
 * Agrège les intervalles en seaux d'heures (buckets)
 * 
 * @param {TimeInterval[]} intervals - Tableau d'intervalles de temps
 * @returns {HourBuckets} Seaux d'heures agrégés
 */
export const aggregateIntervalsToBuckets = (intervals) => {
    const buckets = {
        weekdayDay: 0,
        weekdayNight: 0,
        sundayDay: 0,
        sundayNight: 0,
        holidayDay: 0,
        holidayNight: 0,
        sundayHolidayDay: 0,
        sundayHolidayNight: 0
    };

    intervals.forEach(interval => {
        buckets[interval.category] += interval.hours;
    });

    return buckets;
};

/**
 * Calcule le détail complet pour un seul jour civil
 * Fonction d'orchestration principale qui assemble toutes les pièces
 * 
 * @param {string} date - Date (YYYY-MM-DD)
 * @param {CalculationConfig} config - Configuration du calcul
 * @param {Map<string, boolean>} holidayCache - Cache des jours fériés
 * @returns {CalculationDayDetail} Détail complet de la journée
 */
export const calculateDayDetails = (date, config, holidayCache) => {
    const { 
        mode, 
        startDate, 
        endDate, 
        startTime, 
        endTime, 
        selectedDays, 
        nightShiftStart, 
        nightShiftEnd, 
        weekendH24, 
        holidayH24,
        weekendH24StartAtMidnight = true,
        holidayH24StartAtMidnight = true,
        weekendH24EndAtMidnight = true,
        holidayH24EndAtMidnight = true,
        // RÉTROCOMPATIBILITÉ : excludeHolidays (booléen) conservé comme fallback
        // Priorité : holidayExclusionSet (Set<YYYY-MM-DD>) > excludeHolidays (bool)
        excludeHolidays = false,
        holidayExclusionSet = null
    } = config;

    // Parse date safely using local date helper
    const dayDate = createLocalDate(date);

    const weekday = dayDate.getDay();
    const isHoliday = holidayCache.get(dayDate.toDateString()) || false;
    const isSunday = weekday === 0;
    const isWeekend = weekday === 0 || weekday === 6;

    // Determine if this day should have work hours
    // If the date is strictly after endDate, it can NEVER have a normal shift (only recovery)
    const isPostEndDate = createLocalDate(date) > createLocalDate(endDate);
    let isDaySelected = !isPostEndDate && (mode === 'daily' ? selectedDays.includes(weekday) : true);
    
    // Application de la politique de jours fériés
    // Priorité 1 : holidayExclusionSet (Set<YYYY-MM-DD>) — mode personnalisé ou 'none'
    // Priorité 2 : excludeHolidays (booléen) — rétrocompatibilité avec anciens devis
    if (isDaySelected && isHoliday) {
        let isExcluded;
        if (holidayExclusionSet !== null) {
            // Nouveau système : vérifier si la date est dans l'ensemble des exclusions
            isExcluded = holidayExclusionSet.has(date);
        } else {
            // Système legacy : booléen TOUT ou RIEN
            isExcluded = excludeHolidays;
        }
        if (isExcluded) {
            isDaySelected = false;
        }
    }

    // Determine time range for this day
    let dayStart, dayEnd;

    if (isDaySelected) {
        if (mode === 'continuous') {
            const isFirstDay = date === startDate;
            const isLastDay = date === endDate;

            if (isFirstDay && isLastDay) {
                // Single-day continuous period: exact startTime to endTime
                dayStart = startTime;
                dayEnd = endTime;
            } else if (isFirstDay) {
                // First day of multi-day: startTime to end of day
                dayStart = startTime;
                dayEnd = '24:00';
            } else if (isLastDay) {
                // Last day of multi-day: start of day to endTime
                dayStart = '00:00';
                dayEnd = endTime;
            } else {
                // Middle day: full 24h
                dayStart = '00:00';
                dayEnd = '24:00';
            }
        } else if (mode === 'daily') {
            // Daily mode: use configured times
            dayStart = startTime;
            dayEnd = endTime;
        } else {
            // Unknown mode → no normal intervals
            dayStart = '00:00';
            dayEnd = '00:00';
        }
    } else {
        // Not selected day, will not generate normal intervals
        dayStart = '00:00';
        dayEnd = '00:00';
    }

    // --- RECOVERY LOGIC (Spillover from Previous Day) ---
    // If yesterday was H24 (Weekend or Holiday), and we have an overnight shift,
    // the "Sunday Night" shift part that usually lands on "Monday Morning" was cut off
    // by the H24 logic (which stopped at 24:00 Sunday).
    // We must restore this "Monday Morning" part (00:00 -> endTime) on the current day.

    // 1. Check Previous Day Status
    const prevDate = new Date(dayDate);
    prevDate.setDate(prevDate.getDate() - 1);

    // Only check if previous day is within range? (Actually, even if start date is Monday, 
    // we assume logic starts fresh, but if we are effectively recovering, we need context.
    // However, calculation usually respects startDate. If startDate is Monday, we don't look at Sunday.
    // So we only do this if prevDate >= startDate (roughly). 
    // Actually, calculateMissionHoursWithJournal iterates from startDate. 
    // If prevDate < startDate, we arguably shouldn't add recovery unless it's a continuous flow logic.
    // Let's assume strict startDate boundary -> No recovery if prev day is out of scope.
    const isPrevInRange = prevDate >= createLocalDate(startDate);

    let recoveryIntervals = [];

    if (isPrevInRange) {
        const prevWeekday = prevDate.getDay();
        const prevIsHoliday = holidayCache.get(prevDate.toDateString()) || false;
        const prevIsWeekend = prevWeekday === 0 || prevWeekday === 6;

        // Was previous day selected? (If not, no shift to recover, unless continuous?)
        // In daily mode, we only recover if previous day was active?
        // If Sunday wasn't selected, there was no Sunday shift, so no spillover.
        const isPrevSelected = mode === 'daily' ? selectedDays.includes(prevWeekday) : true;

        // CRITICAL: Recovery logic is ONLY for 'daily' mode.
        // In 'continuous' mode, the day flow handles 00:00 starts automatically for subsequent days.
        // Adding recovery in continuous mode would duplicate hours on the last day.
        if (isPrevSelected && mode === 'daily') {
            const prevIsH24 = (weekendH24 && prevIsWeekend) || (holidayH24 && prevIsHoliday);

            // Check if shift is overnight (EndTime < StartTime)
            const isOvernight = timeToMinutes(dayEnd) < timeToMinutes(dayStart); // Note: dayStart/End here are set from config above
            // Wait, dayStart/End might be 00:00/24:00 if H24 is applied. 
            // We need the *Standard* Configured Times to know if it's overnight.
            const configStartMin = timeToMinutes(startTime);
            const configEndMin = timeToMinutes(endTime);
            const isConfigOvernight = configEndMin <= configStartMin; // e.g. 18:30 -> 07:30

            // If Yesterday was H24 AND we have an Overnight shift pattern
            // Then we must add [00:00 -> endTime] to Today.
            if (prevIsH24 && isConfigOvernight) {
                // But wait! If Today is ALSO H24, then 00:00-24:00 covers it.
                // We only need recovery if Today is NOT covering that period (i.e. Not H24 Full Day).
                // We check this later.

                // Generate recovery intervals
                recoveryIntervals = splitDayIntoIntervals('00:00', endTime, {
                    isHoliday, // Today's status
                    isSunday,
                    nightShiftStart,
                    nightShiftEnd
                }).map(it => ({ ...it, isRecovery: true }));
            }
        }
    }

    // Flag : vrai si '24:00' a été imposé par le planning H24 (weekend ou férié),
    // faux si c'est un shift overnight naturel. Utilisé par Rule B2.
    let dayEndForcedByH24 = false;

    // Application des surcharges H24 pour les week-ends et jours fériés
    // Week-end H24 : Force le début et la fin à 24:00 pour Samedis et Dimanches
    if (weekendH24 && isWeekend && isDaySelected) {
        let shouldStartAtMidnight = weekendH24StartAtMidnight;

        // Si l'option "Commencer à minuit" est désactivée, on vérifie si la veille était déjà un jour de week-end actif
        if (!shouldStartAtMidnight && date !== startDate) {
            const prevDate = new Date(dayDate);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevWeekday = prevDate.getDay();
            const prevIsWeekend = prevWeekday === 0 || prevWeekday === 6;
            const isPrevSelected = mode === 'daily' ? selectedDays.includes(prevWeekday) : true;

            if (prevIsWeekend && isPrevSelected) {
                shouldStartAtMidnight = true;
            }
        }

        if (shouldStartAtMidnight === false || date === startDate) {
            dayStart = startTime;
        } else {
            dayStart = '00:00';
        }

        // --- DÉTERMINATION DE dayEnd (Fin à minuit ou fin standard) ---
        let shouldEndAtMidnight = weekendH24EndAtMidnight !== false;

        // Si "Terminer à minuit" est désactivé, on vérifie si le lendemain est AUSSI un jour de week-end actif consécutif
        if (!shouldEndAtMidnight && date !== endDate) {
            const nextDate = new Date(dayDate);
            nextDate.setDate(nextDate.getDate() + 1);
            const nextWeekday = nextDate.getDay();
            const nextIsWeekend = nextWeekday === 0 || nextWeekday === 6;
            const isNextSelected = mode === 'daily' ? selectedDays.includes(nextWeekday) : true;

            if (nextIsWeekend && isNextSelected) {
                // Entre Samedi et Dimanche consécutifs, on maintient la continuité H24 jusqu'à 24:00
                shouldEndAtMidnight = true;
            }
        }

        if (shouldEndAtMidnight) {
            dayEnd = '24:00';
            dayEndForcedByH24 = true;
        } else {
            dayEnd = endTime;
            dayEndForcedByH24 = false;
        }
    }


    if (holidayH24 && isHoliday && isDaySelected) {
        let shouldStartAtMidnight = holidayH24StartAtMidnight;

        // Si l'option "Commencer à minuit" est désactivée, on vérifie si la veille était déjà un jour férié actif
        if (!shouldStartAtMidnight && date !== startDate) {
            const prevDate = new Date(dayDate);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevIsHoliday = holidayCache.get(prevDate.toDateString()) || false;

            if (prevIsHoliday) {
                shouldStartAtMidnight = true;
            }
        }

        if (shouldStartAtMidnight === false || date === startDate) {
            dayStart = startTime;
        } else {
            dayStart = '00:00';
        }

        let shouldEndAtMidnight = holidayH24EndAtMidnight !== false;

        // Si "Terminer à minuit" est désactivé, on vérifie si le lendemain est AUSSI un jour férié actif consécutif
        if (!shouldEndAtMidnight && date !== endDate) {
            const nextDate = new Date(dayDate);
            nextDate.setDate(nextDate.getDate() + 1);
            const nextIsHoliday = holidayCache.get(nextDate.toDateString()) || false;

            if (nextIsHoliday) {
                shouldEndAtMidnight = true;
            }
        }

        if (shouldEndAtMidnight) {
            dayEnd = '24:00';
            dayEndForcedByH24 = true;
        } else {
            dayEnd = endTime;
            dayEndForcedByH24 = false;
        }
    }

    // ── INTERSECTION BORNES RÉELLES (A+B) ──────────────────────────────────────
    // Règle absolue : aucune heure ne peut être générée en dehors de la période
    // réelle de la mission, même si le planning H24 forcerait des heures hors bornes.
    //
    // S'applique uniquement en mode 'daily'.
    // Positionné APRÈS les deux blocs H24 (weekendH24 ET holidayH24) pour garantir
    // que les bornes réelles ont la priorité absolue sur le planning théorique.
    //
    // Cas couverts :
    //   (A)  Premier jour sélectionné → dayStart ne peut pas commencer avant startTime
    //   (B1) Dernier jour sélectionné (endDate) → dayEnd ne peut pas dépasser endTime
    //   (B2) Jour H24 dont le LENDEMAIN n'est PAS H24 → dayEnd clipé à endTime.
    //        Ex : dimanche H24 suivi d'un lundi normal non sélectionné → clip à 21h00.
    //        S'applique à TOUS les dimanches H24, pas seulement le dernier avant endDate.
    //        Condition de continuité H24 : le lendemain doit être (week-end OU férié)
    //        ET sélectionné ET avoir son propre H24 activé pour maintenir le 24:00.
    if (mode === 'daily') {
        const isFirstDay = date === startDate;
        const isLastDay  = date === endDate;

        // (A) Premier jour sélectionné : ne pas commencer avant l'heure réelle de début
        if (isFirstDay && isDaySelected) {
            const realStartMin    = timeToMinutes(startTime);
            const currentStartMin = timeToMinutes(dayStart);
            if (currentStartMin < realStartMin) {
                dayStart = startTime;
            }
        }

        // (B1) Dernier jour sélectionné : ne pas terminer après l'heure réelle de fin.
        // Règle de protection H24 : ne s'applique pas si le jour a été explicitement
        // imposé en H24 (week-end H24 ou férié H24), afin de garantir les 24h complètes.
        if (isLastDay && isDaySelected && !dayEndForcedByH24) {
            const realEndMin    = timeToMinutes(endTime);
            const currentEndMin = dayEnd === '24:00' ? 1440 : timeToMinutes(dayEnd);
            if (currentEndMin > realEndMin) {
                dayEnd = endTime;
            }
        }

        // (B2) Jour Week-end H24 dont le lendemain N'EST PAS dans selectedDays → clipper à endTime.
        //
        // Un jour H24 peut légitimement aller à '24:00' si :
        //   - Le lendemain est sélectionné (H24 ou normal) → recovery assuré → garder 24:00 ✓
        //   - Le shift est overnight (endTime < startTime, ex: 15:00→07:00) → le mécanisme
        //     de recovery génère les heures 00:00→endTime sur le lendemain → garder 24:00 ✓
        //   - Le jour est un jour férié H24 (holidayH24) → couverture 24h garantie pour le jour férié ✓
        //
        // On clippe à endTime UNIQUEMENT si :
        //   - C'est un jour de week-end H24 sans couverture férié H24
        //   - Le lendemain n'est PAS sélectionné
        //   - ET le shift n'est PAS overnight (ex: 18:00→21:00)
        //
        // Exemples :
        //   18:00→21:00, Dim H24 → Lun NON sélectionné → clip à 21:00 ✓
        //   15:00→07:00, Dim H24 → Lun NON sélectionné → garder 24:00 ✓ (recovery 00:00→07:00 sur lun)
        //   Sam H24 → Dim sélectionné (H24) → garder 24:00 ✓ (continuité H24)
        const isOvernightShift = timeToMinutes(endTime) < timeToMinutes(startTime);
        const isWeekendH24Only = (weekendH24 && isWeekend) && !(holidayH24 && isHoliday);
        if (!isLastDay && isDaySelected && isWeekendH24Only && !isOvernightShift) {
            const nextDayDate = new Date(dayDate);
            nextDayDate.setDate(nextDayDate.getDate() + 1);

            const nextWeekday       = nextDayDate.getDay();
            const isNextDaySelected = selectedDays.includes(nextWeekday);

            if (!isNextDaySelected) {
                // Lendemain absent du planning, shift non-overnight → clipper à endTime
                const realEndMin = timeToMinutes(endTime);
                if (1440 > realEndMin) {
                    dayEnd = endTime;
                }
            }
        }


    }


    // Check for overlap with next day if next day is H24 (Weekend or Holiday)
    // This prevents double counting hours (e.g., Friday night shift overlapping with Saturday H24)
    const nextDay = new Date(dayDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Check if next day is within calculation range
    const isNextDayInRange = nextDay <= createLocalDate(endDate);

    if (isNextDayInRange && isDaySelected) {
        const nextWeekday = nextDay.getDay();
        const nextIsHoliday = holidayCache.get(nextDay.toDateString()) || false;
        const nextIsWeekend = nextWeekday === 0 || nextWeekday === 6;

        // In daily mode, next day must be selected to cause a conflict
        const isNextDaySelected = mode === 'daily' ? selectedDays.includes(nextWeekday) : true;

        if (isNextDaySelected) {
            const nextIsH24 = (weekendH24 && nextIsWeekend) || (holidayH24 && nextIsHoliday);

            if (nextIsH24) {
                const startMin = timeToMinutes(dayStart);
                let endMin = timeToMinutes(dayEnd);
                // Handle overnight wrapping for comparison
                if (endMin <= startMin) endMin += 24 * 60;

                // If shift spills into next day (which is H24), truncate to midnight
                if (endMin > 24 * 60) {
                    dayEnd = '24:00';
                }
            }
        }
    }

    // Split day into categorized intervals
    let intervals = [];
    if (isDaySelected) {
        intervals = splitDayIntoIntervals(dayStart, dayEnd, {
            isHoliday,
            isSunday,
            nightShiftStart,
            nightShiftEnd
        });
    }

    // Merge recovery intervals if applicable
    // Only if Today is NOT H24 (if it is H24, it already covers 00:00-24:00)
    const isDayH24 = isDaySelected && ((weekendH24 && isWeekend) || (holidayH24 && isHoliday));

    if (!isDayH24 && recoveryIntervals.length > 0) {
        // Prepend recovery intervals (Morning) to normal intervals (Evening)
        // Do NOT sort by timeToMinutes, as it would mix Day 0 Morning (00:00) with Day 1 Morning (00:00 from overnight shift)
        // The natural order [Morning, Evening->NextMorning] is correct.
        intervals.unshift(...recoveryIntervals);
    }

    // Aggregate intervals into buckets
    const buckets = aggregateIntervalsToBuckets(intervals);

    // Calculate total hours
    const totalHours = intervals.reduce((sum, interval) => sum + interval.hours, 0);

    return {
        date,
        weekday,
        isWeekend,
        isSunday,
        isHoliday,
        intervals,
        buckets,
        totalHours
    };
};

/**
 * Calcule les heures de mission avec le journal quotidien complet
 * Version améliorée qui retourne la répartition détaillée par jour
 * 
 * @param {CalculationConfig} config - Configuration du calcul
 * @returns {CalculationResult} Résultat complet avec journal quotidien
 */
export const calculateMissionHoursWithJournal = (config) => {
    const { startDate, endDate, mode } = config;

    // Build holiday cache using safe date objects
    const start = createLocalDate(startDate);
    const end = createLocalDate(endDate);
    const holidayRegion = config.holidayRegion || config.country || 'FR';
    const holidayCache = buildHolidayCache(start, end, holidayRegion);

    // Build date range (all civil days, plus one extra day to capture final overnight spillover)
    // The calculateDayDetails function will automatically suppress normal shifts on the extra day
    const dateRange = buildDateRange(startDate, endDate);
    
    // Add endDate + 1 day
    const postEndDate = createLocalDate(endDate);
    postEndDate.setDate(postEndDate.getDate() + 1);
    const postEndDateStr = formatLocalDate(postEndDate);
    if (!dateRange.includes(postEndDateStr)) {
        dateRange.push(postEndDateStr);
    }

    // Calculate details for each day
    const days = dateRange.map(date => {
        const day = calculateDayDetails(date, config, holidayCache);
        return {
            ...day,
            agents: config.agents || 1,
            qualification: config.qualification || ''
        };
    });

    // Aggregate total hours and buckets from daily journal
    let totalHours = 0;
    const buckets = {
        weekdayDay: 0,
        weekdayNight: 0,
        sundayDay: 0,
        sundayNight: 0,
        holidayDay: 0,
        holidayNight: 0,
        sundayHolidayDay: 0,
        sundayHolidayNight: 0
    };

    days.forEach(day => {
        totalHours += day.totalHours;

        // Aggregate buckets
        Object.keys(buckets).forEach(key => {
            buckets[key] += day.buckets[key];
        });
    });

    return {
        totalHours,
        buckets,
        days,  // Daily journal
        mode,
        dateRange: {
            start: startDate,
            end: endDate
        }
    };
};

// ============================================================================
// EXISTING CLASSIFICATION FUNCTIONS
// ============================================================================


/**
 * Classe un créneau temporel dans le seau (bucket) approprié
 * @param {Date} midPoint - Point médian du créneau de 30 minutes
 * @param {string} nightShiftStart - Heure de début de nuit (HH:mm)
 * @param {string} nightShiftEnd - Heure de fin de nuit (HH:mm)
 * @param {Map<string, boolean>} holidayCache - Cache des jours fériés
 * @returns {string} Clé de classification du seau
 */
export const classifySlot = (midPoint, nightShiftStart, nightShiftEnd, holidayCache) => {
    const h = midPoint.getHours();
    const d = midPoint.getDay();
    const isHoliday = holidayCache.get(midPoint.toDateString()) || false;
    const isSunday = d === 0;
    const nightStart = parseInt(nightShiftStart.split(':')[0], 10);
    const nightEnd = parseInt(nightShiftEnd.split(':')[0], 10);
    const isNight = (h >= nightStart || h < nightEnd);

    if (isSunday && isHoliday) return isNight ? 'sundayHolidayNight' : 'sundayHolidayDay';
    if (isSunday) return isNight ? 'sundayNight' : 'sundayDay';
    if (isHoliday) return isNight ? 'holidayNight' : 'holidayDay';
    return isNight ? 'weekdayNight' : 'weekdayDay';
};

/**
 * Marque les créneaux horaires dans la carte principale (master map)
 * @param {Date} localStart - Heure de début
 * @param {Date} localEnd - Heure de fin
 * @param {string} nightShiftStart - Heure de début de nuit
 * @param {string} nightShiftEnd - Heure de fin de nuit
 * @param {Map<string, boolean>} holidayCache - Cache des jours fériés
 * @param {Map<number, string>} masterSlots - Carte principale des créneaux (timestamp -> classification)
 */
export const markSlots = (localStart, localEnd, nightShiftStart, nightShiftEnd, holidayCache, masterSlots) => {
    let scanner = new Date(localStart);
    let safety = 0;

    while (scanner < localEnd && safety < 1000) {
        const midPoint = new Date(scanner.getTime() + 15 * 60 * 1000);
        const type = classifySlot(midPoint, nightShiftStart, nightShiftEnd, holidayCache);
        const ts = midPoint.getTime();

        if (!masterSlots.has(ts)) {
            masterSlots.set(ts, type);
        }

        scanner.setMinutes(scanner.getMinutes() + 30);
        safety++;
    }
};

/**
 * Calcule les heures de mission selon la configuration
 * @param {CalculationConfig} config - Configuration du calcul
 * @returns {CalculationResult|null} Résultat du calcul ou null si la configuration est invalide
 */
export const calculateMissionHours = (config) => {
    const {
        mode,
        startDate,
        endDate,
        startTime,
        endTime,
        selectedDays,
        nightShiftStart,
        nightShiftEnd,
        holidayH24,
        weekendH24,
        useCustomRecurrence = false,
        recurrencePattern = { frequency: 1, interval: 2 },
        useMultiSlots = false,
        timeSlots = []
    } = config;

    // Validation
    if (!startDate || !endDate || !startTime || !endTime) {
        return null;
    }

    const startRange = createLocalDate(startDate);
    const endRange = createLocalDate(endDate);

    if (endRange < startRange) {
        return null;
    }

    // Build holiday cache
    const holidayRegion = config.holidayRegion || config.country || 'FR';
    const holidayCache = buildHolidayCache(startRange, endRange, holidayRegion);

    // Master slots map: timestamp -> classification
    const masterSlots = new Map();

    // PHASE 1: Process H24 Overrides (Priority)
    let hCurrent = new Date(startRange);
    while (hCurrent <= endRange) {
        const isHoliday = holidayCache.get(hCurrent.toDateString());
        const d = hCurrent.getDay();
        const isWeekend = (d === 0 || d === 6);

        const shouldApplyH24 = (holidayH24 && isHoliday) || (weekendH24 && isWeekend);

        if (shouldApplyH24) {
            const hStart = new Date(hCurrent);
            hStart.setHours(0, 0, 0, 0);

            const hEnd = new Date(hCurrent);
            hEnd.setDate(hEnd.getDate() + 1);
            hEnd.setHours(0, 0, 0, 0);

            markSlots(hStart, hEnd, nightShiftStart, nightShiftEnd, holidayCache, masterSlots);
        }

        hCurrent.setDate(hCurrent.getDate() + 1);
    }

    // PHASE 2: Process Normal Schedules
    let dayIterator = new Date(startRange);
    let globalSafety = 0;

    while (dayIterator <= endRange && globalSafety < 3660) {
        let isCycleActive = true;

        if (mode === 'daily' && useCustomRecurrence) {
            const msPerWeek = 7 * 24 * 60 * 60 * 1000;
            const weeksSinceStart = Math.floor((dayIterator.getTime() - startRange.getTime()) / msPerWeek);
            if ((weeksSinceStart % recurrencePattern.interval) >= recurrencePattern.frequency) {
                isCycleActive = false;
            }
        }

        const isSelectedDay = mode === 'daily' ? selectedDays.includes(dayIterator.getDay()) : true;

        if (isCycleActive && isSelectedDay) {
            const slotsToApply = useMultiSlots ? timeSlots : [{ start: startTime, end: endTime }];

            slotsToApply.forEach(slot => {
                const [sh, sm] = slot.start.split(':').map(Number);
                const [eh, em] = slot.end.split(':').map(Number);

                let s = new Date(dayIterator);
                s.setHours(sh, sm, 0, 0);
                let e = new Date(dayIterator);
                e.setHours(eh, em, 0, 0);

                if (e <= s) e.setDate(e.getDate() + 1);

                // CONTINUOUS MODE: Precise datetime handling
                if (mode === 'continuous') {
                    // Reset dates to current dayIterator to undo any overnight shift from line 963
                    // This ensures we operate strictly on the current day slice
                    s = new Date(dayIterator);
                    e = new Date(dayIterator);

                    const isFirstDay = dayIterator.toDateString() === startRange.toDateString();
                    const isLastDay = dayIterator.toDateString() === endRange.toDateString();

                    if (isFirstDay && isLastDay) {
                        // Single-day continuous period: use exact startTime to endTime
                        // Set hours again because we reset s/e
                        const [sh, sm] = startTime.split(':').map(Number);
                        const [eh, em] = endTime.split(':').map(Number);
                        s.setHours(sh, sm, 0, 0);
                        e.setHours(eh, em, 0, 0);

                        // Handle overnight shift on single day (e.g., 22:00 -> 02:00)
                        if (e <= s) {
                            e.setDate(e.getDate() + 1);
                        }
                    } else if (isFirstDay) {
                        // First day: startTime to end of day
                        const [sh, sm] = startTime.split(':').map(Number);
                        s.setHours(sh, sm, 0, 0);
                        e.setHours(23, 59, 59, 999);
                    } else if (isLastDay) {
                        // Last day: start of day to endTime
                        const [eh, em] = endTime.split(':').map(Number);
                        s.setHours(0, 0, 0, 0);
                        e.setHours(eh, em, 0, 0);
                    } else {
                        // Middle days: full 24h
                        s.setHours(0, 0, 0, 0);
                        e.setHours(23, 59, 59, 999);
                    }
                }

                markSlots(s, e, nightShiftStart, nightShiftEnd, holidayCache, masterSlots);
            });
        }

        dayIterator.setDate(dayIterator.getDate() + 1);
        globalSafety++;
    }

    // PHASE 3: Aggregate Buckets
    const buckets = {
        weekdayDay: 0,
        weekdayNight: 0,
        sundayDay: 0,
        sundayNight: 0,
        holidayDay: 0,
        holidayNight: 0,
        sundayHolidayDay: 0,
        sundayHolidayNight: 0
    };

    masterSlots.forEach(type => {
        buckets[type] += 0.5;
    });

    const totalHours = Object.values(buckets).reduce((acc, val) => acc + val, 0);

    return { buckets, totalHours };
};

/**
 * Détecte les chevauchements entre les plages de dates pour la même qualification
 * @param {Array} existingSequences - Séquences existantes
 * @param {string} newStartDate - Nouvelle date de début de séquence
 * @param {string} newEndDate - Nouvelle date de fin de séquence
 * @param {string} newQualification - Nouvelle qualification
 * @returns {Array} Tableau des chevauchements
 */
export const detectOverlaps = (existingSequences, newStartDate, newEndDate, newQualification) => {
    const overlaps = [];
    const newStart = createLocalDate(newStartDate);
    const newEnd = createLocalDate(newEndDate);

    existingSequences.forEach((seq, idx) => {
        // Skip if different qualification
        if (seq.config?.qualification !== newQualification) {
            return;
        }

        const existingStart = createLocalDate(seq.startDate);
        const existingEnd = createLocalDate(seq.endDate);

        // Check if date ranges overlap
        if (newStart <= existingEnd && newEnd >= existingStart) {
            const overlapStart = newStart > existingStart ? newStart : existingStart;
            const overlapEnd = newEnd < existingEnd ? newEnd : existingEnd;

            overlaps.push({
                sequenceIndex: idx,
                sequenceDesc: seq.desc,
                overlapStart: overlapStart.toLocaleDateString('fr-FR'),
                overlapEnd: overlapEnd.toLocaleDateString('fr-FR'),
                existingSequence: seq
            });
        }
    });

    return overlaps;
};

/**
 * Détecte les chevauchements pour la mise à jour d'une séquence (exclut la séquence en cours de mise à jour)
 * @param {Array} existingSequences - Séquences existantes
 * @param {string} idToExclude - ID de la séquence à exclure
 * @param {string} newStartDate - Nouvelle date de début
 * @param {string} newEndDate - Nouvelle date de fin
 * @param {string} newQualification - Nouvelle qualification
 * @returns {Array} Tableau des chevauchements
 */
export const detectOverlapsForUpdate = (existingSequences, idToExclude, newStartDate, newEndDate, newQualification) => {
    const overlaps = [];
    const newStart = createLocalDate(newStartDate);
    const newEnd = createLocalDate(newEndDate);

    existingSequences.forEach((seq) => {
        if (seq.id === idToExclude) return;

        // Skip if different qualification
        if (seq.config?.qualification !== newQualification) {
            return;
        }

        const existingStart = createLocalDate(seq.startDate);
        const existingEnd = createLocalDate(seq.endDate);

        if (newStart <= existingEnd && newEnd >= existingStart) {
            const overlapStart = newStart > existingStart ? newStart : existingStart;
            const overlapEnd = newEnd < existingEnd ? newEnd : existingEnd;

            overlaps.push({
                sequenceDesc: seq.desc,
                overlapStart: overlapStart.toLocaleDateString('fr-FR'),
                overlapEnd: overlapEnd.toLocaleDateString('fr-FR'),
                existingSequence: seq
            });
        }
    });

    return overlaps;
};
