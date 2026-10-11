import { describe, it, expect } from 'vitest';
import { 
    CLIENT_TYPES, 
    CLIENT_STATUS, 
    CLIENT_STATUS_ORDER,
    CLIENT_RISK_LEVELS,
    canTransitionClientStatus,
    isStatusReasonRequired,
    getClientType, 
    getClientStatus,
    isClientParticulier, 
    isClientEtat,
    isEtat,
    isAdministration, 
    isAdministrationPublique, 
    isAssociationClient 
} from './clientEnums.js';

describe('clientEnums - Typologies et Statuts Clients PILOT OS', () => {
    it('définit les 4 typologies majeures', () => {
        expect(CLIENT_TYPES.ENTREPRISE).toBeDefined();
        expect(CLIENT_TYPES.PARTICULIER).toBeDefined();
        expect(CLIENT_TYPES.ASSOCIATION).toBeDefined();
        expect(CLIENT_TYPES.ETAT).toBeDefined();

        expect(CLIENT_TYPES.ENTREPRISE.id).toBe('ENTREPRISE');
        expect(CLIENT_TYPES.PARTICULIER.id).toBe('PARTICULIER');
        expect(CLIENT_TYPES.ASSOCIATION.id).toBe('ASSOCIATION');
        expect(CLIENT_TYPES.ETAT.id).toBe('ETAT');
        expect(CLIENT_TYPES.ETAT.label).toBe('État');
    });

    it('définit le cycle de vie commercial avec distinction prospect / actif', () => {
        expect(CLIENT_STATUS.PROSPECT.isProspect).toBe(true);
        expect(CLIENT_STATUS.ACTIF.isProspect).toBe(false);
        expect(CLIENT_STATUS.LITIGE.isProspect).toBe(false);
    });

    it('getClientType résout correctement ou renvoie ENTREPRISE par défaut', () => {
        expect(getClientType('PARTICULIER')).toBe(CLIENT_TYPES.PARTICULIER);
        expect(getClientType('particulier')).toBe(CLIENT_TYPES.PARTICULIER);
        expect(getClientType('ETAT')).toBe(CLIENT_TYPES.ETAT);
        expect(getClientType('etat')).toBe(CLIENT_TYPES.ETAT);
        expect(getClientType('INCONNU')).toBe(CLIENT_TYPES.ENTREPRISE);
        expect(getClientType(null)).toBe(CLIENT_TYPES.ENTREPRISE);
    });

    it('fonctions utilitaires de typologie', () => {
        expect(isClientParticulier('PARTICULIER')).toBe(true);
        expect(isClientParticulier('ENTREPRISE')).toBe(false);
        expect(isClientEtat('ETAT')).toBe(true);
        expect(isEtat('ETAT')).toBe(true);
        expect(isAdministration('ETAT')).toBe(true);
        expect(isAdministrationPublique('ETAT')).toBe(true);
        expect(isAssociationClient('ASSOCIATION')).toBe(true);
    });

    it('valide l\'ordre canonique du pipeline tactique à 4 jalons et getClientStatus', () => {
        expect(CLIENT_STATUS_ORDER).toEqual(['prospect', 'actif', 'pause', 'resilie']);
        expect(getClientStatus('actif').label).toBe('Client Actif');
        expect(getClientStatus({ statut: 'litige' }).id).toBe('litige');
        expect(getClientStatus('inconnu').id).toBe('prospect');
    });

    it('valide les niveaux de risques et la FSM de transition', () => {
        // Niveaux de risques transversaux
        expect(CLIENT_RISK_LEVELS.MINEUR.id).toBe('MINEUR');
        expect(CLIENT_RISK_LEVELS.MAJEUR.id).toBe('MAJEUR');
        expect(CLIENT_RISK_LEVELS.BLOQUANT.id).toBe('BLOQUANT');

        // Transitions FSM autorisées
        expect(canTransitionClientStatus('prospect', 'actif')).toBe(true);
        expect(canTransitionClientStatus('prospect', 'resilie')).toBe(true);
        expect(canTransitionClientStatus('actif', 'pause')).toBe(true);
        expect(canTransitionClientStatus('actif', 'resilie')).toBe(true);
        expect(canTransitionClientStatus('pause', 'actif')).toBe(true);
        expect(canTransitionClientStatus('pause', 'resilie')).toBe(true);
        expect(canTransitionClientStatus('resilie', 'actif')).toBe(true);

        // Transitions interdites
        expect(canTransitionClientStatus('prospect', 'pause')).toBe(false);
        expect(canTransitionClientStatus('resilie', 'pause')).toBe(false);

        // Motifs obligatoires
        expect(isStatusReasonRequired('pause')).toBe(true);
        expect(isStatusReasonRequired('resilie')).toBe(true);
        expect(isStatusReasonRequired('actif')).toBe(false);
    });
});
