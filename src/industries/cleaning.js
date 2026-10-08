export const CLEANING_PACK = {
    id: 'cleaning',
    idcc: '3173',
    label: 'Proprete & Services Associes (IDCC 3173)',
    conventionLabel: 'Convention collective nationale des entreprises de proprete et services associes (IDCC 3173)',
    qualifications: [
        { value: 'ASH', label: 'Agent de Service Hospitalier (ASH)', coefficient: 'AS1', hourlyRateMin: 12.00, billingRateSuggested: 23.50 },
        { value: 'AEN', label: "Agent d'Entretien et de Renovation", coefficient: 'AS2', hourlyRateMin: 12.20, billingRateSuggested: 24.50 },
        { value: 'Laveur de Vitres', label: 'Laveur de Vitres Specialise', coefficient: 'MP1', hourlyRateMin: 12.80, billingRateSuggested: 28.00 },
        { value: 'Machiniste', label: 'Machiniste / Conducteur Autolaveuse', coefficient: 'MP2', hourlyRateMin: 13.00, billingRateSuggested: 27.50 },
        { value: 'CE', label: "Chef d'Equipe Proprete", coefficient: 'CE1', hourlyRateMin: 13.80, billingRateSuggested: 31.00 }
    ],
    certifications: [
        'CQP Agent Machiniste', 'CQP Agent d\'Entretien', 'Bio-nettoyage', 'Habilitation Risques Chimiques'
    ],
    defaultRates: {
        flatRate: '24.50',
        ASH: '23.50',
        AEN: '24.50',
        'Laveur de Vitres': '28.00',
        Machiniste: '27.50',
        CE: '31.00'
    },
    businessRules: {
        nightShift: { start: '22:00', end: '05:00' },
        holidays: { useOfficial: true },
    },
    clausesContrat: {
        tempsPartielModule: true,
        reprisePersonnelAnnexe7: true,
    },
    ui: {
        agentLabel: "Agent d'Entretien",
        missionTabLabel: 'Consignes Nettoyage'
    }
};
