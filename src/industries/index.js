import { SECURITY_PACK } from './security.js';
import { CLEANING_PACK } from './cleaning.js';

export const AVAILABLE_INDUSTRIES = [
    {
        id: 'security',
        label: 'Sécurité Privée',
        description: 'Gardiennage, Rondes, Interventions, Sécurité Incendie',
        disabled: false
    },
    {
        id: 'cleaning',
        label: 'Nettoyage & Propreté',
        description: 'Bureaux, Hôtellerie, Industriel',
        disabled: false
    },
    {
        id: 'reception',
        label: 'Accueil & Hospitalité',
        description: 'Entreprise, Événementiel (Bientôt disponible)',
        disabled: true
    }
];

export const getIndustryLabel = (id) => {
    const industry = AVAILABLE_INDUSTRIES.find(i => i.id === id);
    return industry ? industry.label : id;
};

export * from './security.js';
export * from './cleaning.js';
export * from './nafMapping.js';
