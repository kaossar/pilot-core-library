import { describe, it, expect } from 'vitest';
import { 
    CLIENT_TYPES, 
    CLIENT_STATUS, 
    CLIENT_STATUS_ORDER,
    getClientType, 
    getClientStatus,
    isClientParticulier, 
    isAdministrationPublique, 
    isAssociationClient 
} from './clientEnums.js';

describe('clientEnums - Typologies et Statuts Clients PILOT OS', () => {
    it('définit les 4 typologies majeures', () => {
        expect(CLIENT_TYPES.ENTREPRISE).toBeDefined();
        expect(CLIENT_TYPES.PARTICULIER).toBeDefined();
        expect(CLIENT_TYPES.ASSOCIATION).toBeDefined();
        expect(CLIENT_TYPES.ADMINISTRATION_PUBLIQUE).toBeDefined();

        expect(CLIENT_TYPES.ENTREPRISE.id).toBe('ENTREPRISE');
        expect(CLIENT_TYPES.PARTICULIER.id).toBe('PARTICULIER');
        expect(CLIENT_TYPES.ASSOCIATION.id).toBe('ASSOCIATION');
        expect(CLIENT_TYPES.ADMINISTRATION_PUBLIQUE.id).toBe('ADMINISTRATION_PUBLIQUE');
        expect(CLIENT_TYPES.ADMINISTRATION_PUBLIQUE.label).toBe('Administration');
    });

    it('définit le cycle de vie commercial avec distinction prospect / actif', () => {
        expect(CLIENT_STATUS.PROSPECT.isProspect).toBe(true);
        expect(CLIENT_STATUS.ACTIF.isProspect).toBe(false);
        expect(CLIENT_STATUS.LITIGE.isProspect).toBe(false);
    });

    it('getClientType résout correctement ou renvoie ENTREPRISE par défaut', () => {
        expect(getClientType('PARTICULIER')).toBe(CLIENT_TYPES.PARTICULIER);
        expect(getClientType('particulier')).toBe(CLIENT_TYPES.PARTICULIER);
        expect(getClientType('ADMINISTRATION_PUBLIQUE')).toBe(CLIENT_TYPES.ADMINISTRATION_PUBLIQUE);
        expect(getClientType('INCONNU')).toBe(CLIENT_TYPES.ENTREPRISE);
        expect(getClientType(null)).toBe(CLIENT_TYPES.ENTREPRISE);
    });

    it('fonctions utilitaires de typologie', () => {
        expect(isClientParticulier('PARTICULIER')).toBe(true);
        expect(isClientParticulier('ENTREPRISE')).toBe(false);
        expect(isAdministrationPublique('ADMINISTRATION_PUBLIQUE')).toBe(true);
        expect(isAssociationClient('ASSOCIATION')).toBe(true);
    });

    it('valide l\'ordre canonique du pipeline tactique et getClientStatus', () => {
        expect(CLIENT_STATUS_ORDER).toEqual(['prospect', 'actif', 'pause', 'litige', 'resilie']);
        expect(getClientStatus('actif').label).toBe('Client Actif');
        expect(getClientStatus({ statut: 'litige' }).id).toBe('litige');
        expect(getClientStatus('inconnu').id).toBe('prospect');
    });
});
