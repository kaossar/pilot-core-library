/**
 * idcc1351.js — Référentiel Officiel Sécurité Privée
 * 
 * Il centralise les métiers, coefficients et tarifs pour l'ensemble de l'application.
 */

export const IDCC_1351_DATA = {
    year: 2026,
    idcc: 1351,

    // Catégories de métiers
    categories: {
        INSTALLATION: "Installation & Technique",
        SURVEILLANCE: "Surveillance & Protection",
        ENCADREMENT: "Agents de maîtrise / Encadrement",
        DIRECTION: "Cadres & Experts / Direction"
    },

    // Liste complète des métiers avec coefficients et tarifs
    professions: [
        // 1. Installation & Technique
        { id: 'm_installateur_alarmes', label: "Monteur-installateur d’alarmes", category: 'INSTALLATION', coefficient: 140 },
        { id: 'aide_monteur_telecom', label: "Aide monteur installations télécommunications et courants faibles", category: 'INSTALLATION', coefficient: 120 },
        { id: 'tech_install_cf', label: "Technicien installations courants faibles", category: 'INSTALLATION', coefficient: 150 },
        { id: 'tech_expert_telecom', label: "Technicien expert télécommunications et réseaux", category: 'INSTALLATION', coefficient: 190 },
        { id: 'tech_radiocom', label: "Technicien en radiocommunication", category: 'INSTALLATION', coefficient: 170 },

        // 2. Surveillance & Protection
        { id: 'ads_qualifie', label: "Agent de sécurité qualifié", category: 'SURVEILLANCE', coefficient: 120, rate: 12.42, monthly: 1883.85 },
        { id: 'ads_confirme', label: "Agent de sécurité confirmé", category: 'SURVEILLANCE', coefficient: 130, rate: 12.58, monthly: 1908.54 },
        { id: 'ads_chef_poste', label: "Agent de sécurité chef de poste", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78 },
        { id: 'ads_mobile', label: "Agent de sécurité mobile", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78 },
        { id: 'ads_magasin_prevention', label: "Agent de sécurité magasin (prévention vols)", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78 },
        { id: 'ads_magasin_video', label: "Agent de sécurité magasin (vidéo)", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78 },
        { id: 'ads_magasin_arriere_caisse', label: "Agent de sécurité magasin (arrière caisse)", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78 },
        { id: 'ads_filtrage', label: "Agent de sécurité filtrage", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78 },
        { id: 'ads_cynophile', label: "Agent de sécurité cynophile", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78, dogAllowance: 1.41 },
        { id: 'ads_ssiap1', label: "Agent de sécurité incendie (SSIAP 1)", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78 },
        { id: 'ads_incendie_indus', label: "Agent de prévention et protection incendie industriel", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78 },
        { id: 'operateur_sct1', label: "Opérateur SCT 1 (Télésurveillance)", category: 'SURVEILLANCE', coefficient: 140, rate: 12.96, monthly: 1965.78 },
        { id: 'garde_corps', label: "Garde du corps privé / privée", category: 'SURVEILLANCE', coefficient: 160 },
        { id: 'ads_aeroport_qualifie', label: "Agent d’exploitation de sûreté qualifié (Aéroportuaire)", category: 'SURVEILLANCE', coefficient: 150, rate: 13.45, monthly: 2039.33 },
        { id: 'pompier_aerodrome', label: "Pompier d’aérodrome (Aéroportuaire)", category: 'SURVEILLANCE', coefficient: 150, rate: 13.45, monthly: 2039.33 },
        { id: 'equipier_incendie_indus', label: "Équipier d’intervention incendie industriel", category: 'SURVEILLANCE', coefficient: 150, rate: 13.45, monthly: 2039.33 },
        { id: 'ads_nucleaire', label: "Agent de sécurité nucléaire", category: 'SURVEILLANCE', coefficient: 150, rate: 13.45, monthly: 2039.33 },
        { id: 'profileur_aeroport', label: "Profileur (Aéroportuaire)", category: 'SURVEILLANCE', coefficient: 160, rate: 14.19, monthly: 2152.09 },
        { id: 'operateur_surete_qual_aero', label: "Opérateur de sûreté qualifié (Aéroportuaire)", category: 'SURVEILLANCE', coefficient: 160, rate: 14.19, monthly: 2152.09 },
        { id: 'operateur_surete_conf_aero', label: "Opérateur de sûreté confirmé (Aéroportuaire)", category: 'SURVEILLANCE', coefficient: 175, rate: 15.34, monthly: 2327.04 },
        { id: 'coordonnateur_aeroport', label: "Coordinateur (Aéroportuaire)", category: 'SURVEILLANCE', coefficient: 190, rate: 16.50, monthly: 2502.06 },

        // 3. Agents de maîtrise / Encadrement
        { id: 'operateur_sct2', label: "Agent de sécurité opérateur SCT 2", category: 'ENCADREMENT', coefficient: 150, rate: 14.73, monthly: 2234.30 },
        { id: 'chef_equipe_ssiap2', label: "Chef d’équipe incendie (SSIAP 2)", category: 'ENCADREMENT', coefficient: 150, rate: 14.73, monthly: 2234.30 },
        { id: 'chef_equipe_incendie_indus', label: "Chef d’équipe prévention incendie industriel", category: 'ENCADREMENT', coefficient: 150, rate: 14.73, monthly: 2234.30 },
        { id: 'chef_poste_nucleaire', label: "Chef de poste nucléaire / sites sensibles", category: 'ENCADREMENT', coefficient: 170 },
        { id: 'pompier_aero_chef_manoeuvre', label: "Pompier d’aérodrome chef de manœuvre (Aéroportuaire)", category: 'ENCADREMENT', coefficient: 185, rate: 17.58, monthly: 2666.29 },
        { id: 'chef_equipe_aeroport', label: "Chef d’équipe (Aéroportuaire)", category: 'ENCADREMENT', coefficient: 200, rate: 18.80, monthly: 2851.20 },
        { id: 'responsable_sslia', label: "Responsable SSLIA (Aéroportuaire)", category: 'ENCADREMENT', coefficient: 235, rate: 21.65, monthly: 3282.88 },
        { id: 'chef_service_ssiap3', label: "Chef de service incendie (SSIAP 3)", category: 'ENCADREMENT', coefficient: 235, rate: 21.65, monthly: 3282.88 },
        { id: 'chef_site_nucleaire', label: "Chef de site nucléaire", category: 'ENCADREMENT', coefficient: 235, rate: 21.65, monthly: 3282.88 },
        { id: 'superviseur_aeroport', label: "Superviseur (Aéroportuaire)", category: 'ENCADREMENT', coefficient: 255, rate: 23.27, monthly: 3529.58 },

        // 4. Cadres & Experts / Direction
        { id: 'responsable_secu_conformite', label: "Responsable sécurité / conformité", category: 'DIRECTION', coefficient: 300, rate: 19.57, monthly: 2968.47 },
        { id: 'responsable_agence', label: "Responsable d’agence sécurité", category: 'DIRECTION', coefficient: 400, rate: 24.77, monthly: 3756.63 },
        { id: 'directeur_secu', label: "Directeur sécurité / sûreté", category: 'DIRECTION', coefficient: 530, rate: 31.52, monthly: 4780.86 },
        { id: 'ingenieur_secu', label: "Ingénieur sécurité", category: 'DIRECTION', coefficient: 620, rate: 36.20, monthly: 5489.93 }
    ],

    // Primes & Indemnités
    allowances: {
        basket: 4.48, // Prime de panier par vacation
        outfit: 8.78, // Entretien tenue par mois
        dogHourly: 1.41 // Prime chien par heure
    },

    // Règles de Paie Conventionnelles (Majorations)
    payRules: {
        nightCoeff:              1.10,  // +10% pour le travail de nuit (21h-06h)
        sundayCoeff:             1.10,  // +10% pour le travail du dimanche
        sundayNightCoeff:        1.20,  // +20% cumul nuit + dimanche
        holidayCoeff:            2.00,  // +100% pour les jours fériés
        holidayNightCoeff:       2.10,  // +110% cumul férié + nuit
        sundayHolidayCoeff:      2.10,  // +110% cumul férié + dimanche
        sundayHolidayNightCoeff: 2.20,  // +120% cumul férié + dimanche + nuit (maximum conventionnel)
    },

    // Références SMIC
    legalRef: {
        hourlySmic: 12.02,
        monthlySmic: 1823.03
    },

    /**
     * Professions regroupées par famille métier — usage UI uniquement.
     * Ne jamais dupliquer les données : les IDs correspondent exactement aux professions[].id.
     * Le tableau professions[] reste la source de vérité pour le moteur de calcul.
     */
    professionGroups: {
        ADS: {
            label: 'Agents de sécurité (ADS)',
            color: 'blue',
            ids: [
                'ads_qualifie', 'ads_confirme', 'ads_chef_poste',
                'ads_mobile', 'ads_magasin_prevention', 'ads_magasin_video',
                'ads_magasin_arriere_caisse', 'ads_filtrage', 'ads_cynophile',
                'operateur_sct1', 'garde_corps',
            ]
        },
        SSIAP1: {
            label: 'SSIAP 1 — Agent incendie',
            color: 'orange',
            ids: ['ads_ssiap1', 'ads_incendie_indus']
        },
        SSIAP2: {
            label: 'SSIAP 2 — Chef d\'équipe incendie',
            color: 'amber',
            ids: ['chef_equipe_ssiap2', 'chef_equipe_incendie_indus', 'equipier_incendie_indus']
        },
        SSIAP3: {
            label: 'SSIAP 3 — Chef de service incendie',
            color: 'red',
            ids: ['chef_service_ssiap3', 'responsable_sslia']
        },
        AEROPORTUAIRE: {
            label: 'Aéroportuaire',
            color: 'sky',
            ids: [
                'ads_aeroport_qualifie', 'pompier_aerodrome',
                'profileur_aeroport', 'operateur_surete_qual_aero',
                'operateur_surete_conf_aero', 'coordonnateur_aeroport',
                'pompier_aero_chef_manoeuvre', 'chef_equipe_aeroport',
                'superviseur_aeroport',
            ]
        },
        NUCLEAIRE: {
            label: 'Nucléaire',
            color: 'green',
            ids: ['ads_nucleaire', 'chef_poste_nucleaire', 'chef_site_nucleaire']
        },
        SCT: {
            label: 'Télésurveillance (SCT)',
            color: 'violet',
            ids: ['operateur_sct2']
        },
        ENCADREMENT: {
            label: 'Encadrement & Direction',
            color: 'slate',
            ids: [
                'responsable_secu_conformite', 'responsable_agence',
                'directeur_secu', 'ingenieur_secu'
            ]
        },
        INSTALLATION: {
            label: 'Installation & Technique',
            color: 'gray',
            ids: [
                'm_installateur_alarmes', 'aide_monteur_telecom',
                'tech_install_cf', 'tech_expert_telecom', 'tech_radiocom'
            ]
        },
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RÈGLES LÉGALES DE PLANIFICATION — IDCC 1351
// Source unique de vérité — utilisée par frontend ET backend (RulesEngine.js)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Constantes légales de planification.
 *
 * ⚠️  Ces valeurs sont la source unique de vérité pour tout PILOT.
 *     Ne jamais les redéclarer dans les composants, contrôleurs ou workers.
 *     Importer depuis @shared/core ou @shared/core/constants.
 *
 * Références légales :
 *  - Art. L3121-18 : durée maximale quotidienne (12h)
 *  - Art. L3121-20 : durée maximale hebdomadaire absolue (48h)
 *  - Art. L3131-1  : repos quotidien minimum (11h)
 *  - CCN IDCC 1351 : repos renforcé nuit→jour (10h), dimanches, CNAPS
 */
export const IDCC_PLANNING_RULES = Object.freeze({
    // ── Vacations ─────────────────────────────────────────────────────────────
    MAX_DAILY_HOURS:              12,  // Durée max par vacation (Art. L3121-18)
    MIN_SHIFT_HOURS_FULLTIME:      6,  // Vacation minimum CDI/CDD
    MIN_SHIFT_HOURS_PARTTIME:      4,  // Vacation minimum temps partiel

    // ── Heures hebdomadaires ──────────────────────────────────────────────────
    MAX_WEEKLY_ABSOLUTE:          48,  // Maximum absolu (Art. L3121-20)
    MAX_WEEKLY_AVERAGE:           46,  // Moyenne sur 12 semaines (Art. L3121-22)
    MAX_WEEKLY_NIGHT_WORKERS:     44,  // Travailleurs de nuit (12 semaines)
    OVERTIME_25_FROM:             36,  // HS +25% de la 36e heure
    OVERTIME_50_FROM:             44,  // HS +50% à partir de la 44e heure
    OVERTIME_WARNING_THRESHOLD:   44,  // Seuil alerte planning
    ANNUAL_OVERTIME_CAP:         288,  // Contingent annuel sans autorisation

    // ── Repos ─────────────────────────────────────────────────────────────────
    MIN_DAILY_REST_HOURS:         11,  // Repos quotidien min (Art. L3131-1)
    MIN_NIGHT_TO_DAY_REST_HOURS:  10,  // Passage nuit→jour : repos renforcé
    MIN_WEEKLY_REST_HOURS:        35,  // Repos hebdomadaire (24h + 11h)

    // ── Dimanches ─────────────────────────────────────────────────────────────
    MAX_SUNDAYS_PER_MONTH:         2,  // Dimanches travaillés max/mois

    // ── CNAPS — Carte Professionnelle ─────────────────────────────────────────
    CNAPS_WARNING_DAYS:           30,  // Alerte si expiration < 30 jours
    CNAPS_RENEWAL_DAYS:           90,  // Demande renouvellement 3 mois avant

    // ── Plage horaire de nuit ─────────────────────────────────────────────────
    NIGHT_START_HOUR:             21,  // 21h00 — début de nuit
    NIGHT_END_HOUR:                6,  // 06h00 — fin de nuit

    // ── Pause obligatoire ─────────────────────────────────────────────────────
    BREAK_AFTER_HOURS:             6,  // Pause dès 6h de travail continu
    BREAK_DURATION_MINUTES:       20,  // Durée minimum de la pause

    // ── Délais de prévenance ──────────────────────────────────────────────────
    PLANNING_NOTICE_DAYS:          7,  // Planning initial : 7 jours avant
    SCHEDULE_CHANGE_HOURS:        48,  // Modification : 48h avant (Art. L3121-42)
});

/**
 * Majorations conventionnelles — coefficients multiplicateurs.
 * Exemple : 1.10 = taux horaire × 1.10 = +10%.
 */
export const IDCC_MAJORATIONS = Object.freeze({
    // Sécurité privée standard
    NUIT:             1.10,  // +10%
    DIMANCHE:         1.10,  // +10%
    FERIE:            2.00,  // +100%
    HS_25:            1.25,  // Heures supp 36e–43e
    HS_50:            1.50,  // Heures supp ≥ 44e

    // Aéroportuaire — majorations renforcées par avenant
    NUIT_AERO:        1.25,  // +25%
    DIMANCHE_AERO:    1.50,  // +50%
});

/**
 * Codes et libellés d'alertes planification — affichés à l'exploitant.
 * Utilisés par RulesEngine.js (backend) et simulateIDCC() (frontend).
 */
export const IDCC_ALERT_LABELS = Object.freeze({
    REST_VIOLATION:   'Repos insuffisant entre deux vacations',
    WEEKLY_MAX:       'Dépassement du maximum légal hebdomadaire (48h)',
    OVERTIME_WARNING: 'Approche du seuil de majoration +50% (44h)',
    CNAPS_MISSING:    'Carte professionnelle CNAPS non renseignée',
    CNAPS_EXPIRED:    'Carte professionnelle CNAPS expirée',
    CNAPS_EXPIRING:   'Carte professionnelle CNAPS expire bientôt',
    SUNDAY_QUOTA:     'Quota de dimanches travaillés atteint',
    SHIFT_TOO_SHORT:  'Vacation inférieure au minimum conventionnel',
    SHIFT_TOO_LONG:   'Vacation supérieure au maximum légal (12h)',
    BREAK_MISSING:    'Pause de 20 min non prévue (> 6h de travail)',
    NOTICE_VIOLATED:  'Prévenance planning insuffisante (< 7 jours)',
});

