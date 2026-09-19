/**
 * @shared/core - Source unique de vérité pour PILOT OS
 *
 * Domaines exportés :
 *   - RBAC & Sécurité
 *   - Calculateurs Métier
 *   - Validateurs de Données
 *   - Constantes & Nomenclatures
 *   - Packs Industries
 *   - Utilitaires transversaux
 *   - Générateurs métier
 *   - Moteurs Operational Intelligence (BillingEngine, PlanningPolicy, PoolOptimizer...)
 */

// RBAC & Sécurité
export * from './rbac/index.js';

// Calculateurs Métier
export * from './calculators/index.js';

// Validateurs de Données
export * from './validators/index.js';

// Constantes & Nomenclatures
export * from './constants/index.js';

// Packs Industries
export * from './industries/index.js';

// Utilitaires transversaux
export * from './utils/index.js';

// Générateurs métier (transformations pures, sans persistance)
export * from './generators/index.js';

// Moteurs Operational Intelligence
// BillingEngine, PlanningPolicy, PoolOptimizer, ...
export * from './engines/index.js';
