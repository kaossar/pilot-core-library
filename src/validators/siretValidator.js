/**
 * Validateur SIRET et SIREN selon la formule de Luhn officielle.
 * Utilisé pour la validation des entreprises françaises.
 */

/**
 * Vérifie si une chaîne de chiffres satisfait l'algorithme de Luhn.
 * @param {string} val - Chaîne numérique à vérifier
 * @returns {boolean}
 */
export const isValidLuhn = (val) => {
    if (typeof val !== 'string' || !/^\d+$/.test(val)) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = val.length - 1; i >= 0; i--) {
        let digit = parseInt(val.charAt(i), 10);
        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
};

/**
 * Valide un numéro SIRET (14 chiffres) ou autorise La Poste (règle spécifique).
 * @param {string} siret 
 * @returns {boolean}
 */
export const validateSIRET = (siret) => {
    if (!siret || typeof siret !== 'string') return false;
    const clean = siret.replace(/\s/g, '');
    if (!/^\d{14}$/.test(clean)) return false;

    // Exception légale La Poste (SIREN 356 000 000)
    if (clean.startsWith('356000000')) {
        let sum = 0;
        for (let i = 0; i < clean.length; i++) {
            sum += parseInt(clean.charAt(i), 10);
        }
        return sum % 5 === 0;
    }

    return isValidLuhn(clean);
};

/**
 * Valide un numéro SIREN (9 chiffres).
 * @param {string} siren 
 * @returns {boolean}
 */
export const validateSIREN = (siren) => {
    if (!siren || typeof siren !== 'string') return false;
    const clean = siren.replace(/\s/g, '');
    if (!/^\d{9}$/.test(clean)) return false;
    return isValidLuhn(clean);
};

/**
 * Formate un SIRET pour l'affichage en groupes : XXX XXX XXX XXXXX
 * @param {string} siret 
 * @returns {string}
 */
export const formatSIRET = (siret) => {
    if (!siret || typeof siret !== 'string') return '';
    const clean = siret.replace(/\D/g, '').slice(0, 14);
    if (clean.length <= 3) return clean;
    if (clean.length <= 6) return `${clean.slice(0, 3)} ${clean.slice(3)}`;
    if (clean.length <= 9) return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`;
};
