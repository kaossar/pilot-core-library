/**
 * Module de Préparation Opérationnelle - Logique Pure
 * 
 * Contient les algorithmes de découpage de vacations, d'analyse de conformité légale
 * et d'attribution de placeholders pour le pré-planning des devis.
 * 
 * @module prePlanner
 */

import { createLocalDate } from './missionCalculator.js';
import { assignAgentRotation, STRATEGIES } from './rotationEngine.js';

/**
 * Calcule l'équivalent ETP (Equivalent Temps Plein) sur une base mensuelle de 151.67 heures.
 * 
 * @param {number} totalHours - Heures totales de prestation
 * @returns {number} Nombre d'ETP arondi à 2 décimales
 */
export const calculateEtpEquivalent = (totalHours) => {
    if (!totalHours || totalHours <= 0) return 0;
    const baseMensuelle = 151.67;
    return Math.round((totalHours / baseMensuelle) * 100) / 100;
};

// ============================================================================
// DIMENSIONNEMENT DU POOL DE ROTATION
// ============================================================================

/**
 * Maximum légal hebdomadaire par agent (Code du travail L3121-20).
 * Plancher absolu : aucun mode ne peut descendre en dessous.
 */
export const MAX_LEGAL_WEEKLY_HOURS = 48;

/**
 * Cible hebdomadaire par défaut pour le mode "équipe restreinte".
 * Représente un objectif opérationnel (heures normales, équipe stable),
 * PAS une contrainte réglementaire.
 * La CCN ou des accords d'entreprise peuvent modifier cette valeur.
 */
export const DEFAULT_TARGET_WEEKLY_HOURS = 40;

/**
 * Cible hebdomadaire pour le mode "équipe confortable" (avec marge absences ~15%).
 * Permet d'absorber congés, absences et formations sans tension sur le planning.
 */
export const COMFORTABLE_TARGET_WEEKLY_HOURS = 35;

/**
 * Modes de dimensionnement du pool de rotation.
 * Chaque mode correspond à une cible d'heures hebdomadaires par agent.
 *
 * minimum_legal : ceil(hours / 48) — plancher absolu légal. Serré, à valider avec le moteur.
 * restricted    : ceil(hours / 40) — équipe restreinte. Connaissance du site. (DÉFAUT)
 * comfortable   : ceil(hours / 35) — marge ~15% pour absences et congés.
 */
export const POOL_MODES = {
    MINIMUM_LEGAL: 'minimum_legal',
    RESTRICTED:    'restricted',
    COMFORTABLE:   'comfortable',
};

/**
 * Suggère une taille de pool de rotation selon l'objectif opérationnel choisi.
 *
 * ⚠️  CETTE VALEUR EST UNE ESTIMATION, PAS UNE GARANTIE.
 *     Le moteur rotationEngine reste souverain : il vérifie vacation par vacation
 *     les contraintes CCN APS (repos 11h, 6j max, 48h/sem, repos hebdo 35h).
 *     Même avec un pool "suggéré" à N agents, une rotation conforme n'est pas garantie
 *     si les amplitudes, qualifications ou contraintes temporelles l'empêchent.
 *
 * Trois modes disponibles, du plus serré au plus confortable :
 *
 *   minimum_legal : ceil(hours / 48h) — plancher absolu légal.
 *                   ⚠️ À ne pas utiliser en production sans vérification manuelle.
 *                   Ex : 84h/sem → 2 agents (42h/sem chacun — légal mais serré)
 *
 *   restricted    : ceil(hours / 40h) — DÉFAUT. Équipe stable, maîtrise du site.
 *                   Idéal quand le client veut une petite équipe expérimentée.
 *                   Ex : 84h/sem → 3 agents (28h/sem chacun — confortable)
 *
 *   comfortable   : ceil(hours / 35h) — Marge ~15% pour absences, congés, formations.
 *                   Recommandé pour les missions longue durée ou à fort turn-over.
 *                   Ex : 108h/sem → 4 agents (27h/sem chacun)
 *
 * Le plancher légal (48h/sem) est TOUJOURS appliqué, quel que soit le mode.
 *
 * @param {Object} params
 * @param {number} params.concurrentAgents                               - Agents simultanés (plancher absolu)
 * @param {number} [params.weeklyMissionHours]                           - Heures de couverture/semaine
 * @param {'minimum_legal'|'restricted'|'comfortable'} [params.mode]    - Mode (défaut: restricted)
 * @returns {number} Estimation du pool (avant override utilisateur)
 */
export const suggestRotationPool = ({ concurrentAgents, weeklyMissionHours, mode }) => {
    if (!weeklyMissionHours || weeklyMissionHours <= 0) return Math.max(concurrentAgents, 1);

    // Cibles hebdomadaires par mode
    const TARGET_BY_MODE = {
        [POOL_MODES.MINIMUM_LEGAL]: MAX_LEGAL_WEEKLY_HOURS,          // 48h
        [POOL_MODES.RESTRICTED]:    DEFAULT_TARGET_WEEKLY_HOURS,     // 40h
        [POOL_MODES.COMFORTABLE]:   COMFORTABLE_TARGET_WEEKLY_HOURS, // 35h
    };

    const safeMode   = mode ?? POOL_MODES.RESTRICTED;
    const targetHours = TARGET_BY_MODE[safeMode] ?? DEFAULT_TARGET_WEEKLY_HOURS;

    // Plancher légal absolu — toujours appliqué, quel que soit le mode
    const legalFloor       = Math.ceil(weeklyMissionHours / MAX_LEGAL_WEEKLY_HOURS);
    // Plancher opérationnel selon le mode choisi
    const operationalFloor = Math.ceil(weeklyMissionHours / targetHours);

    return Math.max(legalFloor, operationalFloor, concurrentAgents, 1);
};

/**
 * Résout la taille effective du pool de rotation en appliquant l'override utilisateur.
 * Séparé de suggestRotationPool pour faciliter les tests unitaires et la traçabilité.
 * La décision reste toujours dans la main de l'utilisateur — le logiciel ne force pas.
 *
 * @param {Object} params
 * @param {number} params.suggestionPool   - Valeur estimée par suggestRotationPool
 * @param {number} params.concurrentAgents - Plancher absolu (jamais sous les postes simultanés)
 * @param {number} [params.manualPool]     - Override utilisateur (0 ou absent = suggestion auto)
 * @returns {number} Taille effective du pool
 */
export const resolveRotationPool = ({ suggestionPool, recommendedPool, concurrentAgents, manualPool }) => {
    // Rétro-compat : anciens appelants utilisaient recommendedPool
    const pool = suggestionPool ?? recommendedPool;
    if (manualPool > 0) return Math.max(manualPool, concurrentAgents);
    return pool;
};

/**
 * @deprecated Utiliser suggestRotationPool(). Conservé pour rétro-compatibilité.
 * Cet alias sera supprimé dans une version future.
 */
export const computeRecommendedPool = ({ concurrentAgents, weeklyMissionHours }) =>
    suggestRotationPool({ concurrentAgents, weeklyMissionHours, mode: POOL_MODES.RESTRICTED });


/**
 * Détermine le statut et la gravité d'une vacation selon sa durée.
 * 
 * @param {number} durationHours - Durée de la vacation en heures
 * @returns {'ok'|'warning'|'strong_warning'|'critical'} Niveau de gravité
 */
export const getShiftDurationSeverity = (durationHours) => {
    if (durationHours <= 12) return 'ok';
    if (durationHours <= 15) return 'warning';
    if (durationHours <= 18) return 'strong_warning';
    return 'critical';
};

/**
 * Découpe un bloc de couverture continu en vacations individuelles selon les règles configurées
 * et les décisions de l'utilisateur.
 * 
 * @param {Date} blockStart - Date/Heure de début du bloc
 * @param {Date} blockEnd - Date/Heure de fin du bloc
 * @param {Object} config - Configuration générale (startTime, endTime, etc.)
 * @param {Object} [userDecision] - Décision utilisateur spécifique pour ce bloc
 * @returns {Array<{startAt: Date, endAt: Date, userDecision: string}>} Liste des shifts découpés
 */
export const splitContinuousBlock = (blockStart, blockEnd, config = {}, userDecision = null) => {
    const shifts = [];
    const startTime = config.startTime;
    const endTime = config.endTime;
    const maxShiftDuration = config.maxShiftDuration || 12;

    const startMs = blockStart.getTime();
    const endMs = blockEnd.getTime();
    const durationHours = (endMs - startMs) / 3600000;

    // Si la durée est inférieure ou égale à 12h, aucun découpage n'est requis
    if (durationHours <= 12) {
        return [{ startAt: new Date(blockStart), endAt: new Date(blockEnd), userDecision: 'keep_raw' }];
    }

    // Détection du mode H24 / Continu (durée > 18h ou bloquant)
    const isH24 = durationHours > 18 || (blockStart.getHours() === 0 && blockEnd.getHours() === 0 && durationHours >= 24);

    if (isH24) {
        // Découpage automatique intelligent H24
        // Bornes déduites de l'heure standard : sh:sm (ex: 18h) et son alternance 12h plus tard (ex: 06h)
        const [sh, sm] = startTime.split(':').map(Number);
        const altH = (sh + 12) % 24;

        let t = new Date(blockStart);
        while (t < blockEnd) {
            // Prochain passage à sh:sm
            const b1 = new Date(t);
            b1.setHours(sh, sm, 0, 0);
            if (b1 <= t) b1.setDate(b1.getDate() + 1);

            // Prochain passage à altH:sm
            const b2 = new Date(t);
            b2.setHours(altH, sm, 0, 0);
            if (b2 <= t) b2.setDate(b2.getDate() + 1);

            // Borne la plus proche
            let nextBoundary = b1 < b2 ? b1 : b2;
            if (nextBoundary > blockEnd) {
                nextBoundary = blockEnd;
            }

            shifts.push({
                startAt: new Date(t),
                endAt: new Date(nextBoundary),
                userDecision: 'rotate_12h'
            });

            t = nextBoundary;
        }
    } else {
        // Cas d'une vacation longue non H24 (ex: 17h -> 08h, 15 heures)
        // On applique le choix utilisateur ou la valeur par défaut 'keep_raw'
        const decision = userDecision || 'keep_raw';

        if (decision === 'split_midnight') {
            // Scinder à Minuit
            const midnight = new Date(blockStart);
            midnight.setDate(midnight.getDate() + 1);
            midnight.setHours(0, 0, 0, 0);

            if (midnight > blockStart && midnight < blockEnd) {
                shifts.push({ startAt: new Date(blockStart), endAt: new Date(midnight), userDecision: decision });
                shifts.push({ startAt: new Date(midnight), endAt: new Date(blockEnd), userDecision: decision });
            } else {
                // Si minuit n'est pas dans l'intervalle (ex: shift journée 06h-21h), split au milieu
                const midpoint = new Date(startMs + (endMs - startMs) / 2);
                shifts.push({ startAt: new Date(blockStart), endAt: new Date(midpoint), userDecision: decision });
                shifts.push({ startAt: new Date(midpoint), endAt: new Date(blockEnd), userDecision: decision });
            }
        } else if (decision === 'split_midpoint') {
            // Scinder au milieu (parts égales)
            const midpoint = new Date(startMs + (endMs - startMs) / 2);
            shifts.push({ startAt: new Date(blockStart), endAt: new Date(midpoint), userDecision: decision });
            shifts.push({ startAt: new Date(midpoint), endAt: new Date(blockEnd), userDecision: decision });
        } else if (decision === 'split_12h') {
            // Scinder au bout de 12 heures
            const splitPoint = new Date(startMs + maxShiftDuration * 3600000);
            shifts.push({ startAt: new Date(blockStart), endAt: new Date(splitPoint), userDecision: decision });
            shifts.push({ startAt: new Date(splitPoint), endAt: new Date(blockEnd), userDecision: decision });
        } else {
            // 'keep_raw' : Conserver telle quelle
            shifts.push({ startAt: new Date(blockStart), endAt: new Date(blockEnd), userDecision: 'keep_raw' });
        }
    }

    return shifts;
};

/**
 * Reconstitue et génère le pré-planning prévisionnel sous forme de vacations.
 * 
 * @param {Array<Object>} dailyDays - Journal de calcul quotidien (issu de calculateMissionHoursWithJournal)
 * @param {Object} config - Configuration du calculateur
 * @param {Object} [userDecisions] - Dictionnaire des décisions utilisateur de scission
 * @returns {Array<Object>} Tableau des vacations formatées et planifiées
 */
export const generatePrePlanningShifts = (dailyDays, config = {}, userDecisions = {}) => {
    if (!dailyDays || dailyDays.length === 0) return [];

    // Nombre d'agents simultanés requis sur le poste (ex : 1 gardien à la fois)
    // Rétro-compatibilité : config.agents reste accepté (ancienne API)
    const concurrentAgents = config.concurrentAgents ?? config.agents ?? 1;

    // Pool de rotation physique : combien d'agents physiques se relaient sur ce poste.
    // Distinct de concurrentAgents : 1 poste peut nécessiter 5 agents physiques qui se
    // relaient sur 3 mois pour respecter CCN (repos 11h, 6j max, 48h/sem, repos hebdo 35h).
    // Rétro-compatibilité : config.rotationAgents reste accepté (ancienne API intermédiaire).
    //
    // INVARIANT : rotationPool >= concurrentAgents (toujours).
    // Un pool inférieur au nombre de postes simultanés est physiquement impossible.
    // Math.max garantit le plancher même si la config est absente ou mal renseignée.
    const rotationPoolSize = Math.max(
        config.rotationPool ?? config.rotationAgents ?? concurrentAgents,
        concurrentAgents
    );

    const qualification = config.qualification || 'ads_qualifie';

    // Phase 1 : Aplatir tous les intervalles avec dates locales réelles
    const intervalsList = [];
    dailyDays.forEach((day) => {
        if (!day.intervals || day.intervals.length === 0) return;

        day.intervals.forEach((interval) => {
            const startAt = createLocalDate(day.date);
            const [sh, sm] = (interval.start === '24:00' ? '23:59' : interval.start).split(':').map(Number);
            
            const configStartH = config.startTime ? parseInt(config.startTime.split(':')[0], 10) : 8;
            const configEndH = config.endTime ? parseInt(config.endTime.split(':')[0], 10) : 20;
            const isOvernight = configEndH <= configStartH;
            
            // Check if this day is H24
            const isWeekend = day.isWeekend;
            const isHoliday = day.isHoliday;
            const weekday = new Date(day.date).getDay();
            const selectedDays = config.selectedDays || [1, 2, 3, 4, 5];
            const isDaySelected = selectedDays.includes(weekday);
            const isDayH24 = isDaySelected && ((config.weekendH24 && isWeekend) || (config.holidayH24 && isHoliday));
            
            const shouldShift = isOvernight && sh < configStartH && !isDayH24 && !interval.isRecovery;

            if (shouldShift) {
                startAt.setDate(startAt.getDate() + 1);
            }
            startAt.setHours(sh, sm, 0, 0);

            const endAt = createLocalDate(day.date);
            if (shouldShift) {
                endAt.setDate(endAt.getDate() + 1);
            }

            if (interval.end === '24:00' || interval.end === '00:00') {
                endAt.setDate(endAt.getDate() + 1);
                endAt.setHours(0, 0, 0, 0);
            } else {
                const [eh, em] = interval.end.split(':').map(Number);
                if (eh < sh) {
                    endAt.setDate(endAt.getDate() + 1);
                }
                endAt.setHours(eh, em, 0, 0);
            }

            intervalsList.push({ startAt, endAt });
        });
    });

    if (intervalsList.length === 0) return [];

    // Trier chronologiquement par début de shift
    intervalsList.sort((a, b) => a.startAt - b.startAt);

    // Phase 2 : Fusionner les segments contigus ou chevauchants pour obtenir les blocs de couverture
    const continuousBlocks = [];
    let currentBlock = { ...intervalsList[0] };

    for (let i = 1; i < intervalsList.length; i++) {
        const nextInterval = intervalsList[i];
        
        // Si le début du suivant est avant ou égal à la fin du précédent (avec seuil de 2 secondes de tolérance)
        if (nextInterval.startAt <= new Date(currentBlock.endAt.getTime() + 2000)) {
            // On étend la fin du bloc si le suivant se termine plus tard
            if (nextInterval.endAt > currentBlock.endAt) {
                currentBlock.endAt = nextInterval.endAt;
            }
        } else {
            continuousBlocks.push(currentBlock);
            currentBlock = { ...nextInterval };
        }
    }
    continuousBlocks.push(currentBlock);

    // ─────────────────────────────────────────────────────────────────────────────
    // Phase 2.5 : Correction des fins de blocs H24 tronquées
    //
    // Problème : le dernier segment d'un bloc H24 peut être inférieur à maxShiftDuration
    // lorsque blockEnd est à minuit (00:00) et que la borne naturelle suivante (ex: 08:00)
    // est hors du bloc.
    //
    // Exemple : bloc 20:00 Ven → 00:00 Lun (config 20:00-08:00)
    //   → dernier segment = 20:00 Dim → 00:00 Lun = 4h  ← tronqué
    //   → attendu          = 20:00 Dim → 08:00 Lun = 12h ← après correction
    //
    // Solution : on étend blockEnd jusqu'à la prochaine borne naturelle si le dernier
    // segment calculé serait inférieur à maxShiftDuration.
    //
    // Garde : n'activer que si weekendH24 ou holidayH24 est actif.
    // Les blocs synthétiques sans H24 ne doivent pas être étendus.
    // ─────────────────────────────────────────────────────────────────────────────
    if (config.startTime && (config.weekendH24 || config.holidayH24)) {
        const [sh, sm] = config.startTime.split(':').map(Number);
        const altH = (sh + 12) % 24;
        const maxShift = config.maxShiftDuration || 12;

        continuousBlocks.forEach(block => {
            const blockDurationHours = (block.endAt - block.startAt) / 3600000;

            // On ne corrige que les blocs de type H24 (durée supérieure au shift maximum)
            if (blockDurationHours <= maxShift) return;

            // Dernière borne (sh ou altH) STRICTEMENT avant blockEnd
            const prevSh = new Date(block.endAt);
            prevSh.setHours(sh, sm, 0, 0);
            if (prevSh >= block.endAt) prevSh.setDate(prevSh.getDate() - 1);

            const prevAltH = new Date(block.endAt);
            prevAltH.setHours(altH, sm, 0, 0);
            if (prevAltH >= block.endAt) prevAltH.setDate(prevAltH.getDate() - 1);

            const lastBoundary = prevSh > prevAltH ? prevSh : prevAltH;
            const lastSegmentDuration = (block.endAt - lastBoundary) / 3600000;

            // Si le dernier segment est un fragment (durée positive mais < maxShiftDuration),
            // on étend la fin du bloc jusqu'à la prochaine borne naturelle
            if (lastSegmentDuration > 0 && lastSegmentDuration < maxShift) {
                const nextSh = new Date(block.endAt);
                nextSh.setHours(sh, sm, 0, 0);
                if (nextSh <= block.endAt) nextSh.setDate(nextSh.getDate() + 1);

                const nextAltH = new Date(block.endAt);
                nextAltH.setHours(altH, sm, 0, 0);
                if (nextAltH <= block.endAt) nextAltH.setDate(nextAltH.getDate() + 1);

                // Prendre la borne la plus proche
                block.endAt = nextSh < nextAltH ? nextSh : nextAltH;
            }
        });
    }

    // Phase 3 : Découper chaque bloc continu selon les règles de conformité
    const reconstructedShifts = [];
    continuousBlocks.forEach((block, blockIndex) => {
        // Dégager une clé d'identification du bloc pour retrouver la décision de l'utilisateur
        const blockId = `block-${blockIndex}-${block.startAt.toISOString().split('T')[0]}`;
        const userDecision = userDecisions[blockId] || null;

        const splitShifts = splitContinuousBlock(block.startAt, block.endAt, config, userDecision);

        splitShifts.forEach((shift, shiftIndex) => {
            const duration = (shift.endAt - shift.startAt) / 3600000;
            const severity = getShiftDurationSeverity(duration);

            // Phase 4a : Créer N entrées par slot (N = concurrentAgents = postes simultanés).
            // Chaque entrée correspond à un poste à pourvoir pour cette période.
            // La rotation (Phase 4b) déterminera quel agent physique occupera chaque slot.
            for (let slot = 0; slot < concurrentAgents; slot++) {
                reconstructedShifts.push({
                    id: `${blockId}-s${shiftIndex}-slot${slot}`,
                    blockId,
                    startAt: shift.startAt.toISOString(),
                    endAt: shift.endAt.toISOString(),
                    duration,
                    severity,
                    userDecision: shift.userDecision,
                });
            }
        });
    });

    // Phase 4 : Rotation d'agents conforme CCN (Least Loaded par défaut)
    // Utilise le POOL DE ROTATION (rotationPoolSize) et non agentsCount.
    // Exemple : 1 agent au poste, pool de 5 → A, B, C, D, E se relaient
    // pour respecter les contraintes CCN sur la durée de la mission.
    const strategy = config.rotationStrategy || STRATEGIES.LEAST_LOADED;
    const shiftsWithAgents = assignAgentRotation(
        reconstructedShifts,
        rotationPoolSize,
        qualification,
        strategy
    );

    // Filtre pour respecter strictement la période demandée
    const startLimit = config.startDate ? createLocalDate(config.startDate) : null;
    if (startLimit) startLimit.setHours(0, 0, 0, 0);

    const endLimit = config.endDate ? createLocalDate(config.endDate) : null;
    if (endLimit) endLimit.setHours(23, 59, 59, 999);

    return shiftsWithAgents.filter(shift => {
        const sStart = new Date(shift.startAt);
        if (startLimit && sStart < startLimit) return false;
        if (endLimit && sStart > endLimit) return false;
        return true;
    });
};
