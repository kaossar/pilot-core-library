export const FACILITY_PACK = {
    id: 'facility',
    idcc: 'FM',
    label: 'Multi-services & Facility Management',
    conventionLabel: 'Prestations Multiservices et Facility Management - Droit Commun & Services Associes',
    qualifications: [
        { value: 'FACTOTUM', label: 'Agent de Maintenance Multiservice (Factotum)', coefficient: 'OP1', hourlyRateMin: 12.60, billingRateSuggested: 28.00 },
        { value: 'TECHNICIEN_CVC', label: 'Technicien de Maintenance CVC', coefficient: 'TC2', hourlyRateMin: 15.20, billingRateSuggested: 42.00 },
        { value: 'OPERATEUR_LOGISTIQUE', label: 'Operateur Logistique & Courrier', coefficient: 'OP2', hourlyRateMin: 12.30, billingRateSuggested: 26.00 },
        { value: 'REGISSEUR_SITE', label: 'Regisseur General de Site', coefficient: 'TC3', hourlyRateMin: 16.50, billingRateSuggested: 45.00 },
        { value: 'COORDINATEUR_FM', label: 'Coordinateur des Services FM', coefficient: 'CS1', hourlyRateMin: 17.50, billingRateSuggested: 48.00 }
    ],
    certifications: [
        'Habilitation Electrique (B0/BS/BE)',
        'CACES (1/3/5)',
        'SST (Secourisme)',
        'Travail en Hauteur'
    ],
    defaultRates: {
        flatRate: '28.00',
        FACTOTUM: '28.00',
        TECHNICIEN_CVC: '42.00',
        OPERATEUR_LOGISTIQUE: '26.00',
        REGISSEUR_SITE: '45.00',
        COORDINATEUR_FM: '48.00'
    },
    businessRules: {
        nightShift: { start: '21:00', end: '06:00' },
        holidays: { useOfficial: true },
    },
    clausesContrat: {
        polyvalenceTechnique: true,
        interventionsMultisites: true,
    },
    ui: {
        agentLabel: 'Agent Technique Multiservice',
        missionTabLabel: "Consignes d'Intervention"
    }
};
