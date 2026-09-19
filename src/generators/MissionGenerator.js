/**
 * Générateur de missions atomiques depuis un ExecutionPlan approuvé.
 *
 * Responsabilité unique : transformer un ExecutionPlan (plain object)
 * en un tableau de Mission[] (plain objects non persistés).
 *
 * Ce module est pur : il ne connaît pas Drizzle, HTTP, React ni aucun
 * framework. Il reçoit des objets, il retourne des objets.
 *
 * Invariant : 1 shift = 1 mission atomique.
 * Le regroupement visuel (par journée, semaine ou site) est une
 * responsabilité de la couche présentation, jamais du stockage.
 *
 * Cas d'usage couverts :
 *   - Génération complète : MissionGenerator.generate(plan, context)
 *   - Simulation sans persistance : MissionGenerator.simulate(plan, context)
 *   - Génération partielle (une semaine) : filtrer shifts avant d'appeler generate
 *   - Import depuis logiciel tiers : adapter le plan au même shape, appeler generate
 *
 * @module MissionGenerator
 */

// ============================================================================
// UTILITAIRES DE FORMATAGE
// ============================================================================

/**
 * Formate une date ISO en chaîne lisible pour le titre de mission.
 * @param {string|Date} dateInput
 * @returns {string} Ex : "lun. 04/08/2026"
 */
const formatMissionDate = (dateInput) => {
    const d = new Date(dateInput);
    return d.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day:     '2-digit',
        month:   '2-digit',
        year:    'numeric',
    });
};

/**
 * Formate un créneau horaire pour le titre de mission.
 * @param {string|Date} start
 * @param {string|Date} end
 * @returns {string} Ex : "20:00–08:00"
 */
const formatTimeSlot = (start, end) => {
    const toHHMM = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${toHHMM(start)}–${toHHMM(end)}`;
};

// ============================================================================
// TRANSFORMATION SHIFT → MISSION
// ============================================================================

/**
 * Transforme un shift individuel en mission atomique (plain object).
 * Aucun calcul — pure transformation structurelle.
 *
 * @param {Object} shift           - Shift depuis approvedSnapshot.shifts
 * @param {Object} plan            - ExecutionPlan complet
 * @param {Object} missionContext  - Données de contexte { agencyId, clientId, siteId, devisId }
 * @returns {Object} Mission plain object (non persisté)
 */
const shiftToMission = (shift, plan, { agencyId, clientId, siteId, devisId }) => {
    const qualification = shift.placeholder?.qualification
        ?? plan.requirements?.[0]?.qualification
        ?? 'ads_qualifie';

    const startTime = new Date(shift.startAt);
    const endTime   = new Date(shift.endAt);

    // Titre lisible : "APS Qualifié — lun. 04/08/2026 20:00–08:00"
    const title = `${qualification} — ${formatMissionDate(startTime)} ${formatTimeSlot(startTime, endTime)}`;

    // Mode NOMINATIF : l'agent est connu depuis le staffedSnapshot
    // Mode PREVISIONNEL : liste vide — le planning opérationnel complétera
    const assignedAgents = shift.placeholder?.agentId
        ? [{
            agentId:       shift.placeholder.agentId,
            role:          'AGENT',
            qualification,
            name:          shift.placeholder.name || null,
        }]
        : [];

    return {
        agencyId,
        clientId,
        siteId,
        devisId,

        // Traçabilité vers la source du plan
        executionPlanId:      plan.id,
        executionPlanVersion: plan.version,

        // Données de la mission
        title,
        description:    null,
        typeMission:    plan.constraints?.typeMission || 'GARDIENNAGE',
        serviceLevel:   plan.constraints?.serviceLevel || null,
        riskLevel:      plan.constraints?.riskLevel || null,

        // Planning
        mode:           'PONCTUELLE',
        isRecurring:    false,
        recurrenceRule: null,
        startTime,
        endTime,

        // Besoins transmis depuis le plan
        requirements: plan.requirements ?? [{ qualification, quantite: 1 }],

        // Tranches horaires : vide (mission atomique = 1 créneau = startTime/endTime)
        timeSlots: [],

        // Agents : rempli si nominatif, vide si prévisionnel
        assignedAgents,

        // Facturation : snapshot des règles au moment de la génération du plan
        billingRules: plan.billingRulesSnapshot ?? {},

        // Logistique : vide — à renseigner manuellement ou via import
        logistics: {},

        // Statut initial : ENREGISTRE (créée depuis le plan, pas encore confirmée terrain)
        status:   'ENREGISTRE',
        priority: 'MOYENNE',
    };
};

// ============================================================================
// CLASSE PRINCIPALE
// ============================================================================

export class MissionGenerator {
    /**
     * Génère des missions atomiques depuis un ExecutionPlan approuvé.
     *
     * Pré-condition : plan.approvedSnapshot.shifts doit être présent et non vide.
     * Post-condition : retourne exactement autant de missions que de shifts dans le snapshot.
     *
     * @param {Object} plan           - ExecutionPlan (plain object depuis BDD)
     * @param {Object} missionContext - { agencyId, clientId, siteId, devisId }
     * @returns {Object[]} Missions plain objects (non persistées)
     * @throws {Error} Si le snapshot approuvé est absent ou vide
     */
    static generate(plan, missionContext) {
        const snapshot = plan.approvedSnapshot;

        if (!snapshot) {
            throw new Error(
                `ExecutionPlan ${plan.id} : approvedSnapshot absent. ` +
                `Le plan doit être au statut APPROVED avant la conversion.`
            );
        }

        if (!snapshot.shifts?.length) {
            throw new Error(
                `ExecutionPlan ${plan.id} : approvedSnapshot.shifts est vide. ` +
                `Aucune mission ne peut être créée depuis un plan sans vacations.`
            );
        }

        return snapshot.shifts
            .filter(shift => {
                // Éliminer les shifts de durée nulle ou négative (données corrompues)
                const duration = shift.duration
                    ?? ((new Date(shift.endAt) - new Date(shift.startAt)) / 3600000);
                return duration > 0;
            })
            .map(shift => shiftToMission(shift, plan, missionContext));
    }

    /**
     * Simulation sans persistance.
     * Même résultat que generate(), utilisable pour :
     *   - Prévisualisation côté frontend avant conversion
     *   - Tests unitaires sans BDD
     *   - Validation du contenu avant approbation
     *
     * @param {Object} plan           - ExecutionPlan
     * @param {Object} missionContext - { agencyId, clientId, siteId, devisId }
     * @returns {Object[]} Missions plain objects
     */
    static simulate(plan, missionContext) {
        return MissionGenerator.generate(plan, missionContext);
    }

    /**
     * Génération partielle — uniquement les shifts d'une période donnée.
     * Utile pour les avenants ou les régénérations partielles.
     *
     * @param {Object} plan           - ExecutionPlan
     * @param {Object} missionContext - { agencyId, clientId, siteId, devisId }
     * @param {Date}   fromDate       - Début de la période (inclusif)
     * @param {Date}   toDate         - Fin de la période (inclusif)
     * @returns {Object[]} Missions de la période uniquement
     */
    static generatePeriod(plan, missionContext, fromDate, toDate) {
        const snapshot = plan.approvedSnapshot;
        if (!snapshot?.shifts?.length) return [];

        const filteredPlan = {
            ...plan,
            approvedSnapshot: {
                ...snapshot,
                shifts: snapshot.shifts.filter(shift => {
                    const start = new Date(shift.startAt);
                    return start >= fromDate && start <= toDate;
                }),
            },
        };

        return MissionGenerator.generate(filteredPlan, missionContext);
    }
}
