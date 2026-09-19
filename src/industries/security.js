import { IDCC_1351_DATA } from '../constants/idcc1351.js';

export const SECURITY_PACK = {
    id: 'security',
    label: 'Sécurité Privée (IDCC 1351)',
    qualifications: IDCC_1351_DATA.professions
        .filter(p => p.category === 'SURVEILLANCE' || p.category === 'ENCADREMENT')
        .map(p => ({ value: p.id, label: p.label })),

    // Documents & Certifications pour les AGENTS
    certifications: [
        'Carte d\'identité',
        'Carte de séjour',
        'Carte Pro CNAPS',
        'CQP APS',
        'Formation BE manœuvre',
        'Formation Habilitation BS manœuvre',
        'Formation Habilitation Electrique H0B0',
        'Formation HE manœuvre',
        'Formation SSIAP 1',
        'Formation SSIAP 2',
        'Formation SSIAP 3',
        'Formation SST (secourisme)',
        'Mutuelle et Complémentaire',
        'Stage MAC',
        'Vaccination',
        'Vaccination du chien',
        'Visite médicale',
        'Agent Cynophile'
    ],
    
    // Documents requis pour les SOUS-TRAITANTS / AGENCES
    companyDocuments: [
        'Agrément dirigeant',
        'Emploi des étrangers',
        'Extrait KBIS',
        'RC PRO',
        'Régularité fiscale',
        'Vigilance URSSAF'
    ],

    defaultRates: {
        flatRate: '24.00',
    },
    businessRules: {
        nightShift: { start: '21:00', end: '06:00' },
        holidays: { useOfficial: true },
    },
    ui: {
        agentLabel: 'Agent de Sécurité',
        missionTabLabel: 'Consignes Sécurité'
    }
};
