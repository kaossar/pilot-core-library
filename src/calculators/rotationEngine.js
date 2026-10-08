/**
 * Moteur de roulement d'agents — Conformité CCN APS + Code du Travail
 *
 * Responsabilité : distribuer un tableau de vacations (shifts) sur N agents
 * en respectant les contraintes légales françaises, avec équilibrage automatique.
 *
 * Références juridiques :
 *   - L3131-1        : Repos quotidien >= 11h
 *   - L3132-2        : Repos hebdomadaire >= 35h continu
 *   - L3121-20       : Durée hebdo max <= 48h
 *   - CCN APS Art. 7.05 : Jours consécutifs max 6
 *   - IDCC 1351 Art. 7   : Vacation minimum 6h (en vigueur depuis le 01/07/2026)
 *
 * @module rotationEngine
 */

// ============================================================================
// CONSTANTES EXPORTÉES
// ============================================================================

export const VIOLATIONS = {
    NO_OVERLAP:                  'NO_OVERLAP',
    MIN_REST:                    'MIN_REST',
    MIN_WEEKLY_REST:             'MIN_WEEKLY_REST',
    MAX_WEEKLY_HOURS:            'MAX_WEEKLY_HOURS',
    MAX_CONSECUTIVE_WORK_DAYS:   'MAX_CONSECUTIVE_WORK_DAYS',
    NO_AGENT:                    'NO_AGENT',
    MIN_VACATION_HOURS:          'MIN_VACATION_HOURS',          // IDCC 1351 Art. 7 — vacation < 6h (depuis 01/07/2026)
    ROLLING_AVG_12W_EXCEEDED:    'ROLLING_AVG_12W_EXCEEDED',    // IDCC 1351 — moyenne > 44h sur 12 semaines glissantes
    SUNDAY_REST_INSUFFICIENT:    'SUNDAY_REST_INSUFFICIENT',    // IDCC 1351 art. 7.2 — < 2 dimanches de repos/mois
};

// ============================================================================
// CONSTANTES RÉGLEMENTAIRES
// ============================================================================

/**
 * Durée minimale d'une vacation (IDCC 1351 Art. 7).
 * Avant le 01/07/2026 : 4h. Depuis le 01/07/2026 : 6h.
 * Toute vacation < 6h doit être signalée comme violation.
 * Règle du "payé au réel mais au minimum 6h" : même si l'agent travaille 3h,
 * la rémunération et la facturation sont calculées sur 6h.
 */
export const MIN_VACATION_DURATION_HOURS = 6;

/**
 * Moyenne horaire maximale sur une fenêtre glissante de 12 semaines (IDCC 1351).
 * Si la moyenne dépasse 44h/sem sur n'importe quelle fenêtre de 12 semaines consécutives,
 * la contrainte est violée (rappel de salaire + prud'hommes).
 */
export const MAX_ROLLING_12W_AVERAGE_HOURS = 44;

/**
 * Nombre minimum de dimanches de repos par mois (IDCC 1351 art. 7.2).
 * Calculé en moyenne sur une période de 3 mois consécutifs.
 * Chaque dimanche de repos doit précéder ou suivre un autre jour de repos.
 */
export const MIN_SUNDAY_REST_PER_MONTH = 2;

export const STRATEGIES = {
    LEAST_LOADED: 'least_loaded',
    ROUND_ROBIN:  'round_robin',
};

// ============================================================================
// IDENTIFIANT D'AGENT (style Excel)
// ============================================================================

/**
 * Génère un identifiant d'agent lisible, style Excel (A, B, ..., Z, AA, AB, ...).
 * Permet un pool illimité sans caractères ASCII non-lisibles au-delà du 26e agent.
 *
 * @param {number} index - Index 0-basé dans le pool (0 → 'A', 25 → 'Z', 26 → 'AA')
 * @returns {string} Identifiant lisible
 *
 * @example
 * makeAgentId(0)  // 'A'
 * makeAgentId(25) // 'Z'
 * makeAgentId(26) // 'AA'
 * makeAgentId(51) // 'AZ'
 * makeAgentId(52) // 'BA'
 */
export const makeAgentId = (index) => {
    let id = '';
    let n = index;
    do {
        id = String.fromCharCode(65 + (n % 26)) + id;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return id;
};

// ============================================================================
// UTILITAIRES UTC
// ============================================================================

const toUTCDateKey = (date) => date.toISOString().slice(0, 10);

const utcDateMinus1 = (dateKey) => {
    const d = new Date(dateKey + 'T00:00:00.000Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
};

const getUTCCalendarDays = (startUTC, endUTC) => {
    const days = [];
    const startDay = new Date(startUTC);
    startDay.setUTCHours(0, 0, 0, 0);

    const effectiveEnd = new Date(endUTC);
    const isExactMidnight = effectiveEnd.getUTCHours() === 0
        && effectiveEnd.getUTCMinutes() === 0
        && effectiveEnd.getUTCSeconds() === 0
        && effectiveEnd.getUTCMilliseconds() === 0;
    if (isExactMidnight) effectiveEnd.setUTCDate(effectiveEnd.getUTCDate() - 1);
    effectiveEnd.setUTCHours(0, 0, 0, 0);

    const cursor = new Date(startDay);
    while (cursor <= effectiveEnd) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
};

const getISOWeekKey = (dateUTC) => {
    const d = new Date(Date.UTC(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const splitShiftByISOWeek = (startUTC, endUTC) => {
    const portions = [];
    let cursor = new Date(startUTC);
    while (cursor < endUTC) {
        const dayOfWeek = cursor.getUTCDay() || 7;
        const daysToNextMonday = 8 - dayOfWeek;
        const nextMonday = new Date(cursor);
        nextMonday.setUTCDate(nextMonday.getUTCDate() + daysToNextMonday);
        nextMonday.setUTCHours(0, 0, 0, 0);
        const portionEnd = nextMonday < endUTC ? nextMonday : endUTC;
        const hours = (portionEnd.getTime() - cursor.getTime()) / 3600000;
        if (hours > 0) portions.push({ week: getISOWeekKey(cursor), hours: +hours.toFixed(4) });
        cursor = portionEnd;
    }
    return portions;
};

const computeRestPeriods = (orderedAssignments, windowStart, windowEnd) => {
    const periods = [];
    let prevEnd = new Date(windowStart);
    for (const a of orderedAssignments) {
        const aStart = new Date(a.startAt);
        const aEnd   = new Date(a.endAt);
        if (aStart > prevEnd) periods.push({ hours: (aStart.getTime() - prevEnd.getTime()) / 3600000 });
        if (aEnd > prevEnd) prevEnd = aEnd;
    }
    if (prevEnd < windowEnd) periods.push({ hours: (windowEnd.getTime() - prevEnd.getTime()) / 3600000 });
    return periods;
};

/**
 * Crée l'état interne d'un agent pour le moteur de rotation.
 *
 * @param {string} id           - Identifiant de l'agent (placeholder 'A' ou UUID réel)
 * @param {Object} initialState - État RH initial (mode nominatif uniquement).
 *   Permet au moteur de tenir compte des heures déjà planifiées avant la mission.
 *   Propriétés supportées :
 *     - name              {string}   : Nom affiché dans les résultats
 *     - weeklyHoursConsumed {number} : Heures déjà planifiées cette semaine
 *     - workedDays        {string[]} : Jours déjà travaillés (ISO dates 'YYYY-MM-DD')
 *     - lastShiftEnd      {string}   : Fin de la dernière vacation (ISO string)
 *     - consecutiveDays   {number}   : Jours consécutifs en cours
 *     - lastWorkedDay     {string}   : Dernier jour travaillé (ISO date)
 *     - weeklyHoursMap    {Object}   : Map week-key -> heures (ex: {'2026-W30': 32})
 *     - recentAssignments {Array}    : Vacations récentes { startAt, endAt } pour repos 35h
 */
const createAgentState = (id, initialState = {}) => ({
    id,
    name:            initialState.name || id,
    totalHours:      initialState.weeklyHoursConsumed || 0,
    workedDays:      new Set(initialState.workedDays || []),
    lastShiftStart:  null,
    lastShiftEnd:    initialState.lastShiftEnd ? new Date(initialState.lastShiftEnd) : null,
    consecutiveDays: initialState.consecutiveDays || 0,
    lastWorkedDay:   initialState.lastWorkedDay || null,
    weeklyHours:     new Map(Object.entries(initialState.weeklyHoursMap || {})),
    assignments:     (initialState.recentAssignments || []),
});

// ============================================================================
// RÈGLES CCN — PIPELINE
// ============================================================================

const checkNoOverlap = (agent, shift) => {
    if (!agent.lastShiftEnd) return { ok: true };
    return { ok: shift.startAt >= agent.lastShiftEnd, code: VIOLATIONS.NO_OVERLAP };
};

const checkMinimumRest = (agent, shift) => {
    if (!agent.lastShiftEnd) return { ok: true };
    const restMs = shift.startAt.getTime() - agent.lastShiftEnd.getTime();
    return { ok: restMs >= 11 * 3600 * 1000, code: VIOLATIONS.MIN_REST };
};

/**
 * Vérifie que la vacation dure au moins MIN_VACATION_DURATION_HOURS (6h).
 * IDCC 1351 Art. 7 — en vigueur depuis le 01/07/2026.
 * Ce check est informatif : le moteur assign quand même l'agent (la violation est signalée
 * mais ne bloque pas l'assignation car le sous-total est dû contractuellement).
 */
const checkMinimumVacationDuration = (shift) => {
    return {
        ok: shift.duration >= MIN_VACATION_DURATION_HOURS,
        code: VIOLATIONS.MIN_VACATION_HOURS,
    };
};

const checkConsecutiveDays = (agent, shift) => {
    const shiftDays = getUTCCalendarDays(shift.startAt, shift.endAt);
    if (shiftDays.length === 0) return { ok: true };
    const trulyNewDays = shiftDays.filter(d => !agent.workedDays.has(d));
    if (trulyNewDays.length === 0) return { ok: true };
    const dayBeforeFirst = utcDateMinus1(shiftDays[0]);
    const isContiguous = agent.workedDays.has(dayBeforeFirst);
    const projectedStreak = isContiguous
        ? agent.consecutiveDays + trulyNewDays.length
        : trulyNewDays.length;
    return { ok: projectedStreak <= 6, code: VIOLATIONS.MAX_CONSECUTIVE_WORK_DAYS };
};

const checkWeeklyHours = (agent, shift) => {
    for (const { week, hours } of splitShiftByISOWeek(shift.startAt, shift.endAt)) {
        if ((agent.weeklyHours.get(week) || 0) + hours > 48) {
            return { ok: false, code: VIOLATIONS.MAX_WEEKLY_HOURS };
        }
    }
    return { ok: true };
};

const checkWeeklyRest = (agent, shift) => {
    if (agent.assignments.length === 0) return { ok: true };
    const windowStart = new Date(shift.startAt.getTime() - 7 * 24 * 3600 * 1000);
    const windowHours = (shift.startAt.getTime() - windowStart.getTime()) / 3600000;
    if (windowHours < 35) return { ok: true };
    const ordered = [...agent.assignments]
        .filter(a => new Date(a.endAt) > windowStart)
        .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    if (ordered.length === 0) return { ok: true };
    const restPeriods = computeRestPeriods(ordered, windowStart, shift.startAt);
    const maxRestH = restPeriods.length > 0 ? Math.max(...restPeriods.map(r => r.hours)) : windowHours;
    return { ok: maxRestH >= 35, code: VIOLATIONS.MIN_WEEKLY_REST };
};

const RULES = [
    checkNoOverlap,
    checkMinimumRest,
    checkConsecutiveDays,
    checkWeeklyHours,
    checkWeeklyRest,
];

// ============================================================================
// SÉLECTION DE L'AGENT (3 critères)
// ============================================================================

const selectBestAgent = (compatibleAgents, shiftStartAt) => {
    return [...compatibleAgents].sort((a, b) => {
        const restA = a.lastShiftEnd !== null ? shiftStartAt.getTime() - a.lastShiftEnd.getTime() : Infinity;
        const restB = b.lastShiftEnd !== null ? shiftStartAt.getTime() - b.lastShiftEnd.getTime() : Infinity;
        if (restA !== restB) return restB - restA;
        if (a.totalHours !== b.totalHours) return a.totalHours - b.totalHours;
        return a.id.localeCompare(b.id);
    })[0];
};

// ============================================================================
// MISE À JOUR DE L'ÉTAT AGENT
// ============================================================================

const updateAgentState = (agent, shift) => {
    const startUTC = shift.startAt;
    const endUTC   = shift.endAt;

    const allDays = getUTCCalendarDays(startUTC, endUTC);
    const trulyNewDays = allDays.filter(d => !agent.workedDays.has(d));

    if (trulyNewDays.length > 0) {
        const dayBeforeFirst = utcDateMinus1(allDays[0]);
        const isContiguous = agent.workedDays.has(dayBeforeFirst);
        agent.consecutiveDays = isContiguous
            ? agent.consecutiveDays + trulyNewDays.length
            : trulyNewDays.length;
        agent.lastWorkedDay = allDays[allDays.length - 1];
    }

    allDays.forEach(d => agent.workedDays.add(d));
    agent.lastShiftStart = startUTC;
    agent.lastShiftEnd   = endUTC;

    const durationH = (endUTC.getTime() - startUTC.getTime()) / 3600000;
    agent.totalHours = +(agent.totalHours + durationH).toFixed(4);

    for (const { week, hours } of splitShiftByISOWeek(startUTC, endUTC)) {
        agent.weeklyHours.set(week, +((agent.weeklyHours.get(week) || 0) + hours).toFixed(4));
    }

    agent.assignments.push({ startAt: startUTC.toISOString(), endAt: endUTC.toISOString() });
};

// ============================================================================
// STRATÉGIES D'ASSIGNATION
// ============================================================================

const evaluateAgent = (agent, shiftInput) => {
    const violations = [];
    for (const rule of RULES) {
        const result = rule(agent, shiftInput);
        if (!result.ok) violations.push(result.code);
    }
    return { agent, violations, compatible: violations.length === 0 };
};

/**
 * Sélectionne l'agent "le moins mauvais" quand aucun n'est totalement conforme.
 * Critères (par ordre de priorité) :
 *   1. Le moins de violations CCN
 *   2. Le plus repose (repos le plus long)
 *   3. Le moins chargé en heures
 *   4. Alphabétique (déterministe)
 *
 * Garantit qu'un agent réel (A, B, C...) est toujours assigné,
 * même en cas de violation CCN (affichée dans l'UI).
 */
const selectLeastBadAgent = (evals, shiftStartAt) => {
    return [...evals].sort((a, b) => {
        // 1. Moins de violations d'abord
        if (a.violations.length !== b.violations.length) return a.violations.length - b.violations.length;
        // 2. Plus repose d'abord
        const restA = a.agent.lastShiftEnd !== null ? shiftStartAt.getTime() - a.agent.lastShiftEnd.getTime() : Infinity;
        const restB = b.agent.lastShiftEnd !== null ? shiftStartAt.getTime() - b.agent.lastShiftEnd.getTime() : Infinity;
        if (restA !== restB) return restB - restA;
        // 3. Moins charge d'abord
        if (a.agent.totalHours !== b.agent.totalHours) return a.agent.totalHours - b.agent.totalHours;
        // 4. Alphabetique (deterministe)
        return a.agent.id.localeCompare(b.agent.id);
    })[0];
};

const assignShiftLeastLoaded = (shift, agents, qualification) => {
    const startAt = new Date(shift.startAt);
    const endAt   = new Date(shift.endAt);
    const shiftInput = { startAt, endAt, duration: shift.duration };
    const evals = agents.map(a => evaluateAgent(a, shiftInput));
    const compatibles = evals.filter(e => e.compatible).map(e => e.agent);

    if (compatibles.length === 0) {
        // Aucun agent conforme : assigner le moins mauvais avec ses violations
        const leastBad = selectLeastBadAgent(evals, startAt);
        updateAgentState(leastBad.agent, { startAt, endAt, duration: shift.duration });
        return {
            ...shift,
            unassignable: true,
            severity: 'critical',
            violations: leastBad.violations,
            placeholder: { id: leastBad.agent.id, qualification },
        };
    }

    const selected = selectBestAgent(compatibles, startAt);
    updateAgentState(selected, { startAt, endAt, duration: shift.duration });

    // Vérification vacation minimum (IDCC 1351 Art. 7) — informative, ne bloque pas l'assignation
    const vacationCheck = checkMinimumVacationDuration({ duration: shift.duration });
    const vacationViolations = vacationCheck.ok ? [] : [vacationCheck.code];

    return { ...shift, unassignable: false, violations: vacationViolations, placeholder: { id: selected.id, qualification } };
};

const createRoundRobinAssigner = (agents) => {
    let currentIndex = 0;
    return (shift, qualification) => {
        const startAt = new Date(shift.startAt);
        const endAt   = new Date(shift.endAt);
        const shiftInput = { startAt, endAt, duration: shift.duration };
        const evals = agents.map(a => evaluateAgent(a, shiftInput));
        for (let attempt = 0; attempt < agents.length; attempt++) {
            const idx = (currentIndex + attempt) % agents.length;
            if (evals[idx].compatible) {
                currentIndex = (idx + 1) % agents.length;
                updateAgentState(agents[idx], { startAt, endAt, duration: shift.duration });
                // Vérification vacation minimum (IDCC 1351 Art. 7) — informative
                const vacCheck = checkMinimumVacationDuration({ duration: shift.duration });
                const vacViolations = vacCheck.ok ? [] : [vacCheck.code];
                return { ...shift, unassignable: false, violations: vacViolations, placeholder: { id: agents[idx].id, qualification } };
            }
        }
        // Aucun agent conforme : assigner le moins mauvais avec ses violations
        const leastBad = selectLeastBadAgent(evals, startAt);
        currentIndex = (agents.indexOf(leastBad.agent) + 1) % agents.length;
        updateAgentState(leastBad.agent, { startAt, endAt, duration: shift.duration });
        return {
            ...shift,
            unassignable: true,
            severity: 'critical',
            violations: leastBad.violations,
            placeholder: { id: leastBad.agent.id, qualification },
        };
    };
};

const getAssignFunction = (strategy, agents, qualification) => {
    if (strategy === STRATEGIES.ROUND_ROBIN) {
        const rrAssign = createRoundRobinAssigner(agents);
        return (shift) => rrAssign(shift, qualification);
    }
    return (shift) => assignShiftLeastLoaded(shift, agents, qualification);
};

// ============================================================================
// EXPORTS PRINCIPAUX
// ============================================================================

export function assignAgentRotation(shifts, agentsCount, qualification, strategy = STRATEGIES.LEAST_LOADED) {
    if (!shifts || shifts.length === 0) return [];
    if (!agentsCount || agentsCount <= 0) return shifts;
    // Utilise makeAgentId pour des IDs lisibles au-delà de Z (AA, AB, etc.)
    const agents = Array.from({ length: agentsCount }, (_, i) => createAgentState(makeAgentId(i)));
    const assignFn = getAssignFunction(strategy, agents, qualification || 'ads_qualifie');
    return shifts.map(shift => assignFn(shift));
}

/**
 * Mode NOMINATIF — assigne des agents réels à la place de placeholders anonymes.
 *
 * Différence clé avec `assignAgentRotation` :
 *   - Chaque resource transporte son état RH réel (heures déjà consommées,
 *     jours travaillés, dernière vacation...) via `initialState`.
 *   - Le moteur CCN prend donc des décisions basées sur la réalité de chaque agent,
 *     pas sur une simulation vierge.
 *   - Le `placeholder` du shift résultant porte l'UUID réel de l'agent.
 *
 * @param {Array}  shifts     - Shifts générés par prePlanner
 * @param {Array}  resources  - Agents disponibles avec leur état RH :
 *   [{ id, name, qualification, weeklyHoursConsumed, workedDays,
 *      lastShiftEnd, consecutiveDays, recentAssignments, weeklyHoursMap }]
 * @param {string} strategy   - STRATEGIES.LEAST_LOADED | STRATEGIES.ROUND_ROBIN
 * @returns {Array} Shifts avec placeholder.id = UUID agent réel
 */
export function assignAgentRotationWithResources(
    shifts,
    resources,
    strategy = STRATEGIES.LEAST_LOADED
) {
    if (!shifts?.length) return shifts ?? [];
    if (!resources?.length) return shifts;

    // Initialise les états agents depuis les données RH réelles.
    // La qualification est portée par chaque resource individuellement.
    const agents = resources.map(r => createAgentState(r.id, r));

    // En mode nominatif, la qualification par défaut est celle de la première resource.
    // Le moteur peut l'affiner par agent si resources[i].qualification est présent.
    const defaultQual = resources[0]?.qualification || 'ads_qualifie';

    const assignFn = getAssignFunction(strategy, agents, defaultQual);
    return shifts.map(shift => {
        const result = assignFn(shift);
        // Enrichir le placeholder avec le nom réel de l'agent si disponible
        const resource = resources.find(r => r.id === result.placeholder?.id);
        if (resource?.name && result.placeholder) {
            result.placeholder = { ...result.placeholder, name: resource.name };
        }
        return result;
    });
}

/**
 * Calcule le résumé RH enrichi par agent à partir des vacations assignées.
 *
 * Retourne pour chaque agent :
 *   - totalHours / shiftsCount / unassigned : compteurs basiques
 *   - weeklyHoursMap : Map<weekKey, hours> — heures par semaine ISO
 *   - rolling12WAvgMax : float — moyenne max sur 12 semaines glissantes
 *   - rolling12WViolation : bool — true si rolling12WAvgMax > 44h (IDCC 1351)
 *   - sundayWorkedByMonth : Map<'YYYY-MM', count> — dimanches travaillés par mois
 *   - sundayRestByMonth : Map<'YYYY-MM', count> — dimanches de repos par mois
 *   - sundayViolation : bool — true si un mois a < 2 dimanches de repos (IDCC 1351 art. 7.2)
 *   - minVacationViolationCount : int — vacations < 6h (IDCC 1351 Art. 7)
 *
 * @param {Array} shiftsWithAgents - Tableau de shifts assignés par assignAgentRotation
 * @returns {Array} Tableau trié par ID d'agent
 */
export function getAgentSummary(shiftsWithAgents) {
    if (!shiftsWithAgents || shiftsWithAgents.length === 0) return [];

    const map = new Map();

    for (const shift of shiftsWithAgents) {
        const id = shift.placeholder?.id || '?';
        if (!map.has(id)) {
            map.set(id, {
                id,
                totalHours:             0,
                shiftsCount:            0,
                unassigned:             0,
                minVacationViolationCount: 0,
                // Heures par semaine ISO (clé : '2026-W30')
                weeklyHoursMap:         new Map(),
                // Dimanches travaillés par mois (clé : '2026-07')
                sundayWorkedByMonth:    new Map(),
            });
        }

        const e = map.get(id);
        const dur = shift.duration || 0;
        e.totalHours  = +(e.totalHours + dur).toFixed(2);
        e.shiftsCount += 1;
        if (shift.unassignable) e.unassigned += 1;

        // Comptage des vacations trop courtes (IDCC 1351 Art. 7)
        if (shift.violations?.includes(VIOLATIONS.MIN_VACATION_HOURS)) {
            e.minVacationViolationCount += 1;
        }

        // Accumulation des heures par semaine ISO
        if (shift.startAt && shift.endAt) {
            for (const { week, hours } of splitShiftByISOWeek(new Date(shift.startAt), new Date(shift.endAt))) {
                e.weeklyHoursMap.set(week, (e.weeklyHoursMap.get(week) || 0) + hours);
            }
        }

        // Détection des dimanches travaillés
        if (shift.startAt) {
            const startDate = new Date(shift.startAt);
            if (startDate.getUTCDay() === 0) { // 0 = dimanche en UTC
                const monthKey = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`;
                e.sundayWorkedByMonth.set(monthKey, (e.sundayWorkedByMonth.get(monthKey) || 0) + 1);
            }
        }
    }

    // Post-traitement : calcul des agrégats réglementaires par agent
    const summaries = [];
    for (const [, e] of map) {
        const weeks = [...e.weeklyHoursMap.keys()].sort();

        // --- Moyenne glissante 12 semaines (IDCC 1351) ---
        let rolling12WAvgMax = 0;
        for (let i = 0; i <= weeks.length - 1; i++) {
            const window12 = weeks.slice(i, i + 12);
            const totalInWindow = window12.reduce((acc, w) => acc + (e.weeklyHoursMap.get(w) || 0), 0);
            const avg = totalInWindow / window12.length;
            if (avg > rolling12WAvgMax) rolling12WAvgMax = avg;
        }

        // --- Dimanches de repos par mois (IDCC 1351 art. 7.2) ---
        // Détermination de tous les dimanches de la période à partir des vacations
        const allMonths = new Set();
        for (const shift of shiftsWithAgents) {
            if ((shift.placeholder?.id || '?') !== e.id) continue;
            if (!shift.startAt) continue;
            const d = new Date(shift.startAt);
            allMonths.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
        }

        // Pour chaque mois de la période, compter les dimanches totaux vs travaillés
        const sundayRestByMonth = new Map();
        let sundayViolation = false;
        for (const monthKey of [...allMonths].sort()) {
            const [yr, mo] = monthKey.split('-').map(Number);
            // Nombre de dimanches dans ce mois calendaire
            let totalSundaysInMonth = 0;
            const firstDay = new Date(Date.UTC(yr, mo - 1, 1));
            const lastDay  = new Date(Date.UTC(yr, mo, 0));
            for (let d = new Date(firstDay); d <= lastDay; d.setUTCDate(d.getUTCDate() + 1)) {
                if (d.getUTCDay() === 0) totalSundaysInMonth++;
            }
            const worked  = e.sundayWorkedByMonth.get(monthKey) || 0;
            const restSun = totalSundaysInMonth - worked;
            sundayRestByMonth.set(monthKey, restSun);
            if (restSun < MIN_SUNDAY_REST_PER_MONTH) sundayViolation = true;
        }

        summaries.push({
            id:                       e.id,
            totalHours:               e.totalHours,
            shiftsCount:              e.shiftsCount,
            unassigned:               e.unassigned,
            minVacationViolationCount: e.minVacationViolationCount,
            weeklyHoursMap:           Object.fromEntries(e.weeklyHoursMap),   // sérialisable JSON
            rolling12WAvgMax:         +rolling12WAvgMax.toFixed(2),
            rolling12WViolation:      rolling12WAvgMax > MAX_ROLLING_12W_AVERAGE_HOURS,
            sundayWorkedByMonth:      Object.fromEntries(e.sundayWorkedByMonth),
            sundayRestByMonth:        Object.fromEntries(sundayRestByMonth),
            sundayViolation,
        });
    }

    return summaries.sort((a, b) => a.id.localeCompare(b.id));
}