export const RECEPTION_PACK = {
    id: 'reception',
    idcc: '2098',
    label: 'Accueil & Hospitalite (IDCC 2098)',
    conventionLabel: 'Convention collective nationale du personnel des entreprises de services tertiaires - Accueil (IDCC 2098)',
    qualifications: [
        { value: 'HOTE_ACCUEIL', label: "Hote / Hotesse d'Accueil Entreprise", coefficient: 'N1', hourlyRateMin: 12.10, billingRateSuggested: 25.00 },
        { value: 'HOTE_EVENEMENTIEL', label: "Hote / Hotesse Evenementiel", coefficient: 'N2', hourlyRateMin: 12.50, billingRateSuggested: 27.00 },
        { value: 'HOTE_VIP_BILINGUE', label: "Hote / Hotesse Bilingue & Protocole VIP", coefficient: 'N3', hourlyRateMin: 13.50, billingRateSuggested: 32.00 },
        { value: 'CHEF_EQUIPE_ACCUEIL', label: "Chef d'Equipe Accueil & Reception", coefficient: 'CE1', hourlyRateMin: 14.20, billingRateSuggested: 34.00 },
        { value: 'SUPERVISEUR_MULTISITE', label: "Superviseur Multisite Accueil", coefficient: 'AM', hourlyRateMin: 15.50, billingRateSuggested: 38.00 }
    ],
    certifications: [
        'Certification Langues (TOEIC/Bright)',
        'Habilitation Accueil Entreprise',
        'SST (Secourisme)',
        'Permis B'
    ],
    defaultRates: {
        flatRate: '25.00',
        HOTE_ACCUEIL: '25.00',
        HOTE_EVENEMENTIEL: '27.00',
        HOTE_VIP_BILINGUE: '32.00',
        CHEF_EQUIPE_ACCUEIL: '34.00',
        SUPERVISEUR_MULTISITE: '38.00'
    },
    businessRules: {
        nightShift: { start: '21:00', end: '06:00' },
        holidays: { useOfficial: true },
    },
    clausesContrat: {
        horairesDecales: true,
        tenueAccueilEntretien: true,
    },
    ui: {
        agentLabel: "Hote / Hotesse d'Accueil",
        missionTabLabel: 'Consignes Accueil'
    }
};
