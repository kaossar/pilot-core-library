import { describe, it, expect } from 'vitest';
import { 
    CLIENT_TYPES, 
    CLIENT_STATUS, 
    getClientType, 
    isClientParticulier, 
    isOrganismePublic, 
    isAssociationClient 
} from './clientEnums.js';

describe('clientEnums - Typologies et Statuts Clients PILOT OS', () => {
    it('définit les 4 typologies juridiques majeures', () => {
        expect(CLIENT_TYPES.ENTREPRISE).toBeDefined();
        expect(CLIENT_TYPES.PARTICULIER).toBeDefined();
        expect(CLIENT_TYPES.ASSOCIATION).toBeDefined();
        expect(CLIENT_TYPES.ORGANISME_PUBLIC).toBeDefined();

        expect(CLIENT_TYPES.ENTREPRISE.requiresSiret).toBe(true);
        expect(CLIENT_TYPES.PARTICULIER.requiresSiret).toBe(false);
        expect(CLIENT_TYPES.PARTICULIER.isMoralPerson).toBe(false);
        expect(CLIENT_TYPES.ORGANISME_PUBLIC.requiresChorusPro).toBe(true);
    });

    it('définit le cycle de vie commercial avec distinction prospect / actif', () => {
        expect(CLIENT_STATUS.PROSPECT.isProspect).toBe(true);
        expect(CLIENT_STATUS.ACTIF.isProspect).toBe(false);
        expect(CLIENT_STATUS.LITIGE.isProspect).toBe(false);
    });

    it('getClientType résout correctement ou renvoie ENTREPRISE par défaut', () => {
        expect(getClientType('PARTICULIER')).toBe(CLIENT_TYPES.PARTICULIER);
        expect(getClientType('particulier')).toBe(CLIENT_TYPES.PARTICULIER);
        expect(getClientType('ORGANISME_PUBLIC')).toBe(CLIENT_TYPES.ORGANISME_PUBLIC);
        expect(getClientType('INCONNU')).toBe(CLIENT_TYPES.ENTREPRISE);
        expect(getClientType(null)).toBe(CLIENT_TYPES.ENTREPRISE);
    });

    it('fonctions utilitaires de typologie', () => {
        expect(isClientParticulier('PARTICULIER')).toBe(true);
        expect(isClientParticulier('ENTREPRISE')).toBe(false);
        expect(isOrganismePublic('ORGANISME_PUBLIC')).toBe(true);
        expect(isAssociationClient('ASSOCIATION')).toBe(true);
    });
});
