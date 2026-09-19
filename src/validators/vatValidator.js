/**
 * Validateur de numéro de TVA intracommunautaire
 * Supporte tous les pays de l'UE avec validation de format et calcul de clé
 */

const VAT_PATTERNS = {
    AT: /^ATU\d{8}$/, // Autriche
    BE: /^BE0?\d{9}$/, // Belgique
    BG: /^BG\d{9,10}$/, // Bulgarie
    CY: /^CY\d{8}[A-Z]$/, // Chypre
    CZ: /^CZ\d{8,10}$/, // République Tchèque
    DE: /^DE\d{9}$/, // Allemagne
    DK: /^DK\d{8}$/, // Danemark
    EE: /^EE\d{9}$/, // Estonie
    EL: /^EL\d{9}$/, // Grèce (code EL, pas GR)
    ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, // Espagne
    FI: /^FI\d{8}$/, // Finlande
    FR: /^FR[A-HJ-NP-Z0-9]{2}\d{9}$/, // France (2 caractères alphanumériques + 9 chiffres SIREN)
    GB: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/, // Royaume-Uni (Brexit mais encore utilisé)
    HR: /^HR\d{11}$/, // Croatie
    HU: /^HU\d{8}$/, // Hongrie
    IE: /^IE\d[A-Z0-9]\d{5}[A-Z]$/, // Irlande
    IT: /^IT\d{11}$/, // Italie
    LT: /^LT(\d{9}|\d{12})$/, // Lituanie
    LU: /^LU\d{8}$/, // Luxembourg
    LV: /^LV\d{11}$/, // Lettonie
    MT: /^MT\d{8}$/, // Malte
    NL: /^NL\d{9}B\d{2}$/, // Pays-Bas
    PL: /^PL\d{10}$/, // Pologne
    PT: /^PT\d{9}$/, // Portugal
    RO: /^RO\d{2,10}$/, // Roumanie
    SE: /^SE\d{12}$/, // Suède
    SI: /^SI\d{8}$/, // Slovénie
    SK: /^SK\d{10}$/, // Slovaquie
};

export const validateVATFormat = (vat) => {
    if (!vat || typeof vat !== 'string') {
        return { valid: false, error: 'Numéro de TVA manquant' };
    }
    const cleanVat = vat.replace(/[\s\-\.]/g, '').toUpperCase();
    const countryCode = cleanVat.substring(0, 2);

    if (!VAT_PATTERNS[countryCode]) {
        return {
            valid: false,
            error: `Code pays "${countryCode}" non reconnu ou non supporté`
        };
    }

    const pattern = VAT_PATTERNS[countryCode];
    if (!pattern.test(cleanVat)) {
        return {
            valid: false,
            error: `Format invalide pour le pays ${countryCode}`
        };
    }

    if (countryCode === 'FR') {
        const frValidation = validateFrenchVAT(cleanVat);
        if (!frValidation.valid) {
            return frValidation;
        }
    }

    return {
        valid: true,
        country: countryCode,
        cleanVat
    };
};

const validateFrenchVAT = (cleanVat) => {
    const key = cleanVat.substring(2, 4);
    const siren = cleanVat.substring(4, 13);

    if (!/^\d{9}$/.test(siren)) {
        return {
            valid: false,
            error: 'Le SIREN doit contenir exactement 9 chiffres'
        };
    }

    if (/^\d{2}$/.test(key)) {
        const sirenNumber = parseInt(siren, 10);
        const keyNumber = parseInt(key, 10);
        const calculatedKey = (12 + 3 * (sirenNumber % 97)) % 97;

        if (keyNumber !== calculatedKey) {
            return {
                valid: false,
                error: `Clé de contrôle invalide (attendu: ${calculatedKey.toString().padStart(2, '0')}, reçu: ${key})`
            };
        }
    }
    return { valid: true };
};

export const validateVAT = (vat) => {
    const result = validateVATFormat(vat);
    if (result.valid && result.country === 'FR') {
        result.siren = result.cleanVat.substring(4, 13);
    }
    return result;
};

export const isValidVAT = (vat) => {
    return validateVAT(vat).valid;
};
