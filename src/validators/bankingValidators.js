/**
 * Validateurs et normalisateurs bancaires (IBAN & BIC)
 * Conforme aux normes ISO 13616 (IBAN) et ISO 9362 (BIC/SWIFT)
 */

// Longueurs officielles IBAN par pays (SEPA et principaux pays)
const IBAN_LENGTHS_BY_COUNTRY = {
    AL: 28, AD: 24, AT: 20, AZ: 28, BH: 22, BY: 28, BE: 16, BA: 20, BR: 29,
    BG: 22, CR: 22, HR: 21, CY: 28, CZ: 24, DK: 18, DO: 28, EE: 20, FO: 18,
    FI: 18, FR: 27, GE: 22, DE: 22, GI: 23, GR: 27, GL: 18, GT: 28, HU: 28,
    IS: 26, IE: 22, IL: 23, IT: 27, JO: 30, KZ: 20, XK: 20, KW: 30, LV: 21,
    LB: 28, LI: 21, LT: 20, LU: 20, MK: 19, MT: 31, MR: 27, MU: 30, MD: 24,
    MC: 27, ME: 22, NL: 18, NO: 15, PK: 24, PS: 29, PL: 28, PT: 25, QA: 29,
    RO: 24, SM: 27, SA: 24, RS: 22, SK: 24, SI: 19, ES: 24, SE: 24, CH: 21,
    TN: 24, TR: 26, AE: 23, GB: 22, VA: 22, VG: 24
};

/**
 * Normalise un IBAN en retirant les espaces et tirets, converti en majuscules.
 * @param {string} iban 
 * @returns {string}
 */
export function normalizeIBAN(iban) {
    if (!iban || typeof iban !== 'string') return '';
    return iban.replace(/[\s\-.]/g, '').toUpperCase();
}

/**
 * Valide un IBAN selon l'algorithme ISO 13616 Modulo-97.
 * @param {string} iban 
 * @returns {{ valid: boolean, error?: string, normalized?: string }}
 */
export function validateIBAN(iban) {
    const clean = normalizeIBAN(iban);
    if (!clean) {
        return { valid: false, error: "Numéro IBAN manquant." };
    }

    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(clean)) {
        return { valid: false, error: "Format IBAN invalide (caractères non autorisés)." };
    }

    const countryCode = clean.substring(0, 2);
    const expectedLength = IBAN_LENGTHS_BY_COUNTRY[countryCode];

    if (expectedLength && clean.length !== expectedLength) {
        return {
            valid: false,
            error: `Longueur invalide pour le pays ${countryCode} (attendu: ${expectedLength} caractères, reçu: ${clean.length}).`
        };
    }

    // Réordonnancement : déplacer les 4 premiers caractères à la fin
    const rearranged = clean.slice(4) + clean.slice(0, 4);

    // Remplacer chaque lettre par deux chiffres (A=10, B=11, ... Z=35)
    const numericString = rearranged.replace(/[A-Z]/g, ch => (ch.charCodeAt(0) - 55).toString());

    // Calcul modulo-97 par morceaux pour éviter le débordement d'entier
    let remainder = 0;
    for (let i = 0; numericString.length > i; i += 7) {
        const block = remainder + numericString.substring(i, i + 7);
        remainder = (parseInt(block, 10) % 97).toString();
    }

    const isValid = parseInt(remainder, 10) === 1;
    if (!isValid) {
        return { valid: false, error: "Clé de contrôle IBAN invalide (vérification modulo 97 échouée)." };
    }

    return {
        valid: true,
        normalized: clean,
        countryCode
    };
}

/**
 * Formate un IBAN par blocs de 4 caractères pour l'affichage visuel.
 * @param {string} iban 
 * @returns {string}
 */
export function formatIBAN(iban) {
    const clean = normalizeIBAN(iban);
    if (!clean) return '';
    return clean.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Normalise un code BIC / SWIFT.
 * @param {string} bic 
 * @returns {string}
 */
export function normalizeBIC(bic) {
    if (!bic || typeof bic !== 'string') return '';
    return bic.replace(/[\s\-.]/g, '').toUpperCase();
}

/**
 * Valide un code BIC selon la norme ISO 9362 (8 ou 11 caractères).
 * @param {string} bic 
 * @returns {{ valid: boolean, error?: string, normalized?: string }}
 */
export function validateBIC(bic) {
    const clean = normalizeBIC(bic);
    if (!clean) {
        return { valid: false, error: "Code BIC manquant." };
    }

    // Structure : 4 lettres banque + 2 lettres pays + 2 lettres/chiffres localisation + 3 facultatifs branche
    const bicRegex = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
    if (!bicRegex.test(clean)) {
        return { valid: false, error: "Format BIC/SWIFT invalide (attendu: 8 ou 11 caractères alphanumériques)." };
    }

    return {
        valid: true,
        normalized: clean
    };
}
