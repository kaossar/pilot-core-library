/**
 * engines/index.js — Moteurs métier PILOT Operational Intelligence
 *
 * Export centré de tous les moteurs.
 * Chaque moteur est indépendant et ne dépend que de la core library.
 *
 * Sprint 1 : BillingEngine, PlanningPolicy, PoolOptimizer
 * Sprint 2 : DecisionEngine, SimulationEngine
 */

export { BillingEngine, MinimumVacationRule, SurchargeDecompositionRule, BasketAllowanceRule } from './BillingEngine.js';
export { PlanningPolicy, ROTATION_STRATEGIES, OPTIMIZATION_OBJECTIVES } from './PlanningPolicy.js';
export { computeOptimalPool, suggestRotationScenarios } from './PoolOptimizer.js';
export { DecisionEngine } from './DecisionEngine.js';
export { SimulationEngine } from './SimulationEngine.js';
export { ScoringEngine } from './ScoringEngine.js';
export { RobustnessEngine } from './RobustnessEngine.js';
