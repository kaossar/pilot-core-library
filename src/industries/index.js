import { SECURITY_PACK } from './security.js';
import { CLEANING_PACK } from './cleaning.js';
import { RECEPTION_PACK } from './reception.js';
import { FACILITY_PACK } from './facility.js';

export const AVAILABLE_INDUSTRIES = [
    {
        id: 'security',
        label: 'Securite Privee',
        description: 'Gardiennage, Rondes, Interventions, Securite Incendie',
        disabled: false
    },
    {
        id: 'cleaning',
        label: 'Nettoyage & Proprete',
        description: 'Bureaux, Hotellerie, Industriel',
        disabled: false
    },
    {
        id: 'reception',
        label: 'Accueil & Hospitalite',
        description: 'Entreprise, Evenementiel, Multisite',
        disabled: false
    },
    {
        id: 'facility',
        label: 'Multi-services & Facility Management',
        description: 'Maintenance, Logistique, Coordination technique',
        disabled: false
    }
];

export const getIndustryLabel = (id) => {
    const industry = AVAILABLE_INDUSTRIES.find(i => i.id === id);
    return industry ? industry.label : id;
};

export const INDUSTRY_PACKS = {
    security: SECURITY_PACK,
    cleaning: CLEANING_PACK,
    reception: RECEPTION_PACK,
    facility: FACILITY_PACK
};

export const getIndustryPack = (industryType) => {
    return INDUSTRY_PACKS[industryType] || SECURITY_PACK;
};

export * from './security.js';
export * from './cleaning.js';
export * from './reception.js';
export * from './facility.js';
export * from './nafMapping.js';


