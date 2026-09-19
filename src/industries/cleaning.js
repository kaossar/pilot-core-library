export const CLEANING_PACK = {
    id: 'cleaning',
    label: 'Nettoyage & Propreté',
    qualifications: [
        { value: 'ASH', label: 'Agent de Service Hospitalier' },
        { value: 'AEN', label: "Agent d'Entretien" },
        { value: 'CE', label: "Chef d'Équipe" },
        { value: 'Laveur de Vitres', label: 'Laveur de Vitres' },
        { value: 'Machiniste', label: 'Machiniste' }
    ],
    certifications: [
        'CQP Agent Machiniste', 'CQP Agent d\'Entretien', 'Bio-nettoyage'
    ],
    defaultRates: {
        flatRate: '20.00',
    },
    businessRules: {
        nightShift: { start: '22:00', end: '05:00' },
        holidays: { useOfficial: true },
    },
    ui: {
        agentLabel: "Agent d'Entretien",
        missionTabLabel: 'Consignes Nettoyage'
    }
};
