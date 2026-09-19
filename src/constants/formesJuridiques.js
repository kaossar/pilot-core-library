/**
 * Mapping des codes de formes juridiques SIRENE vers leurs libellés
 * Source: INSEE - Nomenclature des catégories juridiques
 */

export const FORMES_JURIDIQUES = {
    // Sociétés par actions
    '5710': 'SAS (Société par Actions Simplifiée)',
    '5720': 'SASU (Société par Actions Simplifiée Unipersonnelle)',
    '6540': 'SA (Société Anonyme)',
    '5785': 'SA à participation ouvrière',
    '5800': 'Société européenne',

    // SARL et assimilés
    '5499': 'SARL (Société à Responsabilité Limitée)',
    '5498': 'SARL unipersonnelle (EURL)',
    '5505': 'SARL d\'économie mixte',
    '5485': 'SELARL (Société d\'Exercice Libéral à Responsabilité Limitée)',

    // Entreprises individuelles
    '1000': 'Entrepreneur individuel',
    '1100': 'Artisan-commerçant',
    '1200': 'Commerçant',
    '1300': 'Artisan',
    '1400': 'Officier public ou ministériel',
    '1500': 'Profession libérale',
    '1600': 'Exploitant agricole',
    '1700': 'Agent commercial',
    '1800': 'Associé gérant de société',
    '1900': 'Personne physique',

    // Sociétés de personnes
    '6220': 'Société en nom collectif',
    '6316': 'SELURL (Société d\'Exercice Libéral Unipersonnelle à Responsabilité Limitée)',
    '6317': 'SELARL (Société d\'Exercice Libéral à Responsabilité Limitée)',
    '6318': 'SELAS (Société d\'Exercice Libéral par Actions Simplifiée)',
    '6538': 'SELAFA (Société d\'Exercice Libéral à Forme Anonyme)',

    // Associations et organismes sans but lucratif
    '9220': 'Association déclarée',
    '9221': 'Association déclarée d\'insertion par l\'économique',
    '9222': 'Association intermédiaire',
    '9223': 'Groupement d\'employeurs',
    '9224': 'Association d\'avocats à responsabilité professionnelle individuelle',
    '9230': 'Association déclarée, reconnue d\'utilité publique',
    '9240': 'Congrégation',
    '9260': 'Association de droit local (Alsace-Moselle)',
    '9300': 'Fondation',

    // Autres formes
    '2110': 'Indivision',
    '2120': 'Société créée de fait',
    '2210': 'Société en participation',
    '2220': 'Société en participation de professions libérales',
    '2385': 'Société civile de moyens',
    '2900': 'Autre groupement de droit privé non doté de la personnalité morale',

    // Collectivités et établissements publics
    '7111': 'Autorité constitutionnelle',
    '7112': 'Autorité administrative ou publique indépendante',
    '7113': 'Ministère',
    '7120': 'Service central d\'un ministère',
    '7150': 'Service du ministère de la Défense',
    '7160': 'Service déconcentré à compétence nationale d\'un ministère',
    '7171': 'Service déconcentré de l\'État à compétence (inter) régionale',
    '7172': 'Service déconcentré de l\'État à compétence (inter) départementale',
    '7210': 'Commune et commune nouvelle',
    '7220': 'Département',
    '7225': 'Collectivité et territoire d\'Outre Mer',
    '7229': 'Collectivité territoriale à statut particulier',
    '7230': 'Région',
};

export function getFormeJuridiqueLibelle(code) {
    if (!code) return '';
    return FORMES_JURIDIQUES[code] || '';
}

export function isSAS(code) {
    return code === '5710' || code === '5720';
}

export function isSARL(code) {
    return code === '5499' || code === '5498';
}

export function isAssociation(code) {
    return code && code.startsWith('92');
}

export function isEntrepriseIndividuelle(code) {
    return code && code.startsWith('1');
}
