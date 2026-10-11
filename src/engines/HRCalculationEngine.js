/**
 * HRCalculationEngine.js — Moteur Central de Calcul RH, Prépaie et Détection d'Anomalies Multi-Conventions
 * 
 * Responsabilité :
 * Orchestrer de bout en bout le calcul mensuel d'un collaborateur :
 * - Ingestion et validation du contrat et des vacations
 * - Résolution dynamique du profil conventionnel via ConventionRegistry (isolation stricte par IDCC)
 * - Découpage temporel fin via TimeSegmenter selon les plages de nuit conventionnelles
 * - Application des règles conventionnelles via CompensationRuleEngine
 * - Calcul des heures normales, de nuit, dimanche, fériés et 1er Mai selon les bases juridiques
 * - Calcul des heures supplémentaires hebdomadaires selon les paliers de la branche (1351 vs 3173 vs 2098 vs 9999)
 * - Évaluation conditionnelle des primes (panier, tenue, cynophile) sans aucune contamination sectorielle
 * - Détection et hiérarchisation des anomalies (Bloquante, Majeure, Vigilance)
 * - Génération d'une trace d'audit WORM explicable et inviolable
 * 
 * Architecture :
 * 100% logique pure, testable, déterministe, zéro dépendance externe.
 * Commentaires 100 % en français.
 */

import { segmentTimeInterval } from '../segmenters/TimeSegmenter.js';
import { CompensationRuleEngine } from './CompensationRuleEngine.js';
import { ConventionRegistry } from '../rules/ConventionRegistry.js';
import { BASE_CALCULATION_BASIS } from '../rules/ConventionRuleSchema.js';

export class HRCalculationEngine {
    /**
     * @param {Object} [customRules=null] - Règles conventionnelles pré-résolues ou null (résolution dynamique)
     */
    constructor(customRules = null) {
        this.fixedRules = customRules || null;
    }

    /**
     * Calcule la prépaie complète d'un agent pour une période donnée.
     * 
     * @param {Object} params
     * @param {Object} params.agent - Données collaborateur { id, firstName, lastName, ... }
     * @param {Object} params.contract - Données contrat { id, salary, salaryUnit, coefficient, status, ... }
     * @param {Array<Object>} params.shifts - Liste des vacations terrain validées
     * @param {Object} params.period - { start: 'YYYY-MM-01', end: 'YYYY-MM-31' }
     * @param {Object} [params.agencyConfig={}] - Configuration de l'agence { conventionIdcc, nightShiftStart, nightShiftEnd, holidayRegion, state, ... }
     * @returns {Object} Résultat complet pour rh.paies, rh.payroll_variables et audit
     */
    calculatePayroll({ agent, contract, shifts = [], period, agencyConfig = {} }) {
        if (!agent || !agent.id) {
            throw new Error("L'agent est obligatoire pour le calcul de prépaie.");
        }
        if (!contract) {
            throw new Error(`Aucun contrat fourni pour le collaborateur ${agent.firstName || ''} ${agent.lastName || agent.id}`);
        }
        if (!period || !period.start || !period.end) {
            throw new Error("La période (date de début et date de fin) est obligatoire.");
        }

        // 1. Résolution dynamique du jeu de règles conventionnelles
        let targetIdcc = agencyConfig.conventionIdcc || agencyConfig.idcc;
        if (!targetIdcc) {
            if (agencyConfig.industryType === 'cleaning') targetIdcc = '3173';
            else if (agencyConfig.industryType === 'reception') targetIdcc = '2098';
            else if (agencyConfig.industryType === 'general') targetIdcc = '9999';
            else targetIdcc = '1351'; // Défaut historique pour rétrocompatibilité
        }

        const rules = this.fixedRules || ConventionRegistry.resolveRules({
            idcc: targetIdcc,
            date: period.start,
            customCompanyRules: agencyConfig.customPayrollRules || agencyConfig.customCompanyRules || null
        });

        const ruleEngine = new CompensationRuleEngine(rules);
        const rates = ruleEngine.resolveRates(contract);

        // 2. Détection des anomalies d'entrée
        const anomalies = [];

        // Anomalie bloquante : Sous-rémunération sous le minimum conventionnel
        if (rates.isBelowMinimum) {
            anomalies.push({
                code: 'SOUS_MINIMUM_CONVENTIONNEL',
                severity: 'CRITICAL',
                message: `Taux horaire contractuel (${rates.contractHourlyRate} €/h) inférieur au minimum conventionnel ${rules.shortLabel} (${rates.minHourlyRate} €/h pour la qualification ${rates.coefficientLabel}). Rémunération rehaussée automatiquement.`,
                field: 'contract.salary',
                deficit: rates.deficitAmount
            });
        }

        // Anomalie de vigilance : Convention non confirmée / repli droit commun
        if (rules.fallbackActive || rules.status === 'A_CONFIRMER') {
            anomalies.push({
                code: 'CONVENTION_A_CONFIRMER',
                severity: 'WARNING',
                message: rules.warning || "La convention collective de l'entreprise est en attente de vérification par un responsable. Prépaie calculée en mode prévisionnel.",
                field: 'agency.conventionIdcc'
            });
        }

        // Options de découpage temporel adaptées à la convention
        const nightStartResolved = agencyConfig.nightShiftStart || rules.hoursWindows?.nightStart || '21:00';
        const nightEndResolved = agencyConfig.nightShiftEnd || rules.hoursWindows?.nightEnd || '06:00';

        const segmenterOptions = {
            nightStart: nightStartResolved,
            nightEnd: nightEndResolved,
            holidayRegion: agencyConfig.holidayRegion || 'FR',
            state: agencyConfig.state || null
        };

        // 3. Filtrer et ordonner les vacations éligibles
        const validShifts = shifts.filter(s => {
            const st = (s.status || '').toUpperCase();
            return !['ANNULEE', 'ANNULE', 'REFUSE', 'ABSENT'].includes(st);
        }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        // Compteurs d'heures par catégorie conventionnelle
        let dayHours = 0;
        let nightHours = 0;
        let sundayDayHours = 0;
        let sundayNightHours = 0;
        let holidayDayHours = 0;
        let holidayNightHours = 0;
        let sundayHolidayDayHours = 0;
        let sundayHolidayNightHours = 0;
        let mayFirstHours = 0;

        let totalWorkedHours = 0;
        let totalDogHours = 0;

        const evaluatedShifts = [];
        const shiftTraces = [];

        // Suivi journalier des heures pour paniers et durées maximales
        const dailyHoursMap = new Map();
        const dailyNightHoursMap = new Map();
        const weeklyHoursMap = new Map();

        const maxDailyAllowed = rules.workingTimeLimits?.maxDailyHours || 10.0;
        const minDailyRestHours = rules.workingTimeLimits?.minDailyRestHours || 11.0;

        // Traitement vacation par vacation
        for (let i = 0; i < validShifts.length; i++) {
            const shift = validShifts[i];
            const shiftStart = new Date(shift.startTime);
            const shiftEnd = new Date(shift.endTime);

            if (isNaN(shiftStart.getTime()) || isNaN(shiftEnd.getTime()) || shiftEnd <= shiftStart) {
                continue;
            }

            const rawDurationHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
            totalWorkedHours += rawDurationHours;

            // Contrôle de conformité : amplitude quotidienne maximale
            if (rawDurationHours > maxDailyAllowed) {
                anomalies.push({
                    code: 'DEPASSEMENT_DUREE_MAX_JOUR',
                    severity: 'MAJOR',
                    message: `Vacation du ${shiftStart.toISOString().split('T')[0]} d'une durée de ${rawDurationHours.toFixed(2)}h supérieure à la limite conventionnelle de ${maxDailyAllowed}h.`,
                    shiftId: shift.id
                });
            }

            // Contrôle de conformité : repos entre deux vacations consécutives
            if (i > 0) {
                const prevShift = validShifts[i - 1];
                const prevEnd = new Date(prevShift.endTime);
                const restHours = (shiftStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);
                if (restHours >= 0 && restHours < minDailyRestHours) {
                    anomalies.push({
                        code: 'REPOS_JOURNALIER_INSUFFISANT',
                        severity: 'MAJOR',
                        message: `Temps de repos de ${restHours.toFixed(2)}h entre les vacations inférieur au repos obligatoire de ${minDailyRestHours}h.`,
                        shiftId: shift.id,
                        prevShiftId: prevShift.id
                    });
                }
            }

            // Cumul par jour calendaire
            const dayKey = shiftStart.toISOString().split('T')[0];
            dailyHoursMap.set(dayKey, (dailyHoursMap.get(dayKey) || 0) + rawDurationHours);

            // Suivi des heures cynophiles (uniquement si prévu par la convention)
            const isCyno = Boolean(shift.hasDog || shift.isCynophile || shift.dogHours);
            const dogHoursForShift = (isCyno && rules.allowances?.dog) ? rawDurationHours : 0;
            totalDogHours += dogHoursForShift;

            // Découpage temporel à la minute
            const segments = segmentTimeInterval(shiftStart, shiftEnd, segmenterOptions);
            const evaluatedSegments = [];

            let shiftNightHours = 0;

            for (const seg of segments) {
                const evalSeg = ruleEngine.evaluateSegment(seg, rates);
                evaluatedSegments.push(evalSeg);

                const h = seg.durationHours;
                if (seg.isNight) shiftNightHours += h;

                // Cumul des heures selon la catégorie
                switch (seg.category) {
                    case 'DAY_WEEK':
                        dayHours += h;
                        break;
                    case 'NIGHT_WEEK':
                        nightHours += h;
                        break;
                    case 'DAY_SUNDAY':
                        sundayDayHours += h;
                        break;
                    case 'NIGHT_SUNDAY':
                        sundayNightHours += h;
                        break;
                    case 'DAY_HOLIDAY':
                        holidayDayHours += h;
                        break;
                    case 'NIGHT_HOLIDAY':
                        holidayNightHours += h;
                        break;
                    case 'DAY_SUN_HOL':
                        sundayHolidayDayHours += h;
                        break;
                    case 'NIGHT_SUN_HOL':
                        sundayHolidayNightHours += h;
                        break;
                    case 'DAY_MAY_FIRST':
                    case 'NIGHT_MAY_FIRST':
                    case 'DAY_SUN_MAY_FIRST':
                    case 'NIGHT_SUN_MAY_FIRST':
                        mayFirstHours += h;
                        break;
                    default:
                        dayHours += h;
                        break;
                }
            }

            dailyNightHoursMap.set(dayKey, (dailyNightHoursMap.get(dayKey) || 0) + shiftNightHours);

            // Agrégation hebdomadaire ISO
            const weekKey = this.getIsoWeekKey(shiftStart);
            weeklyHoursMap.set(weekKey, (weeklyHoursMap.get(weekKey) || 0) + rawDurationHours);

            evaluatedShifts.push({
                shiftId: shift.id,
                startTime: shiftStart.toISOString(),
                endTime: shiftEnd.toISOString(),
                durationHours: Number(rawDurationHours.toFixed(4)),
                nightHours: Number(shiftNightHours.toFixed(4)),
                isCynophile: isCyno,
                segments: evaluatedSegments
            });

            shiftTraces.push({
                shiftId: shift.id,
                date: dayKey,
                horaires: `${shiftStart.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${shiftEnd.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
                duree: rawDurationHours.toFixed(2),
                heuresNuit: shiftNightHours.toFixed(2),
                segmentsCount: segments.length
            });
        }

        // 4. Calcul des paniers repas selon la convention active
        let basketCount = 0;
        let basketAmount = 0;
        let basketType = 'AUCUN';

        // Pour chaque jour travaillé, évaluer le panier
        for (const [dayKey, dayTotalHours] of dailyHoursMap.entries()) {
            const dayNightHours = dailyNightHoursMap.get(dayKey) || 0;
            const basketEval = ruleEngine.evaluateBasket({
                totalShiftHours: dayTotalHours,
                nightHours: dayNightHours
            });
            if (basketEval.eligible) {
                basketCount++;
                basketAmount = Number((basketAmount + basketEval.amount).toFixed(2));
                basketType = basketEval.type;
            }
        }

        // 5. Calcul des Heures Supplémentaires hebdomadaires selon les paliers de la convention
        const overtimeRules = rules.overtime || {
            weeklyLegalHours: 35.0,
            tier1: { minHours: 35.0, maxHours: 43.0, rate: 0.25 },
            tier2: { minHours: 43.0, rate: 0.50 }
        };

        const tier1Threshold = overtimeRules.tier1.minHours || 35.0;
        const tier2Threshold = overtimeRules.tier1.maxHours || (rules.idcc === '1351' ? 47.0 : 43.0);
        const tier1Span = tier2Threshold - tier1Threshold;

        let overtimeHours25 = 0;
        let overtimeHours50 = 0;
        const weeklyOvertimeDetails = [];

        for (const [weekKey, weeklyTotal] of weeklyHoursMap.entries()) {
            if (weeklyTotal > 48.0) {
                anomalies.push({
                    code: 'DEPASSEMENT_DUREE_MAX_HEBDO',
                    severity: 'MAJOR',
                    message: `Semaine ${weekKey} : cumul de ${weeklyTotal.toFixed(2)}h supérieur au plafond hebdomadaire absolu de 48h.`,
                    week: weekKey
                });
            }

            if (weeklyTotal > tier1Threshold) {
                const hs25 = Math.min(weeklyTotal - tier1Threshold, tier1Span);
                const hs50 = Math.max(0, weeklyTotal - tier2Threshold);
                overtimeHours25 += hs25;
                overtimeHours50 += hs50;

                weeklyOvertimeDetails.push({
                    week: weekKey,
                    totalWeeklyHours: Number(weeklyTotal.toFixed(2)),
                    hs25: Number(hs25.toFixed(2)),
                    hs50: Number(hs50.toFixed(2))
                });
            }
        }

        // 6. Calcul des montants selon les bases de calcul de chaque règle
        const effectiveRate = rates.effectiveHourlyRate;
        const minRate = rates.minHourlyRate;

        const baseGrossAmount = Number((totalWorkedHours * effectiveRate).toFixed(2));

        const totalNightHours = nightHours + sundayNightHours + holidayNightHours + sundayHolidayNightHours;
        const totalSundayHours = sundayDayHours + sundayNightHours + sundayHolidayDayHours + sundayHolidayNightHours;
        const totalHolidayHours = holidayDayHours + holidayNightHours + sundayHolidayDayHours + sundayHolidayNightHours;

        // Majoration nuit selon la convention (1351: 10% sur minRate | 3173: 20% sur effectiveRate | 2098: 25%)
        const nightRule = rules.premiums?.night;
        const nightBaseRate = nightRule?.baseBasis === BASE_CALCULATION_BASIS.CONVENTIONAL_MIN ? minRate : effectiveRate;
        const nightRate = nightRule?.rate || 0;
        const nightMajorationAmount = Number((totalNightHours * nightBaseRate * nightRate).toFixed(2));

        // Majoration dimanche
        const sundayRule = rules.premiums?.sunday;
        const sundayBaseRate = sundayRule?.baseBasis === BASE_CALCULATION_BASIS.CONVENTIONAL_MIN ? minRate : effectiveRate;
        const sundayRate = sundayRule?.rate || 0;
        const sundayMajorationAmount = Number((totalSundayHours * sundayBaseRate * sundayRate).toFixed(2));

        // Majoration jour férié
        const holidayRule = rules.premiums?.holiday;
        const holidayBaseRate = holidayRule?.baseBasis === BASE_CALCULATION_BASIS.CONVENTIONAL_MIN ? minRate : effectiveRate;
        const holidayRate = holidayRule?.rate || 0;
        const holidayMajorationAmount = Number((totalHolidayHours * holidayBaseRate * holidayRate).toFixed(2));

        // Majoration 1er Mai
        const mayFirstRule = rules.premiums?.mayFirst;
        const mayFirstRate = mayFirstRule?.rate || 1.0;
        const mayFirstMajorationAmount = Number((mayFirstHours * effectiveRate * mayFirstRate).toFixed(2));

        // Heures supplémentaires
        const overtime25Rate = overtimeRules.tier1?.rate || 0.25;
        const overtime50Rate = overtimeRules.tier2?.rate || 0.50;
        const overtime25Amount = Number((overtimeHours25 * effectiveRate * overtime25Rate).toFixed(2));
        const overtime50Amount = Number((overtimeHours50 * effectiveRate * overtime50Rate).toFixed(2));

        // Prime d'ancienneté conventionnelle
        const entryDate = agent.entryDate || agent.seniorityDate || agent.dateEntree || contract.startDate;
        const seniorityEval = ruleEngine.evaluateSeniorityAllowance({
            entryDate,
            currentDate: period.start,
            minHourlyRate: minRate,
            totalWorkedHours,
            coefficient: rates.coefficient
        });
        const seniorityAmount = seniorityEval.amount;

        // Primes & indemnités spécifiques à la branche
        const dogEval = ruleEngine.evaluateDogAllowance(totalDogHours);
        const dogAmount = dogEval.amount;

        // Indemnité de tenue
        const periodMonth = new Date(period.start).getMonth() + 1;
        const isExcludedMonth = (agencyConfig.dressingExcludedMonth !== undefined)
            ? agencyConfig.dressingExcludedMonth === periodMonth
            : (rules.idcc === '1351' && periodMonth === 12);

        const dressingEval = isExcludedMonth
            ? { eligible: false, amount: 0, explanation: `Mois ${periodMonth} : mois d'exonération annuel tenue` }
            : ruleEngine.evaluateDressingAllowance(validShifts.length);
        const dressingAmount = dressingEval.amount;

        // Total Brut préparé
        const totalGrossAmount = Number((
            baseGrossAmount +
            nightMajorationAmount +
            sundayMajorationAmount +
            holidayMajorationAmount +
            mayFirstMajorationAmount +
            overtime25Amount +
            overtime50Amount +
            seniorityAmount +
            dressingAmount
        ).toFixed(2));

        // 7. Génération des variables de paie détaillées
        const variables = [];

        if (basketCount > 0 && basketAmount > 0) {
            variables.push({
                type: basketType,
                amount: basketAmount,
                description: `${basketCount} panier(s) conventionnel(s) (${rules.shortLabel})`
            });
        }
        if (dressingAmount > 0) {
            variables.push({
                type: dressingEval.type || 'PRIME_HABILLEMENT',
                amount: dressingAmount,
                description: dressingEval.explanation
            });
        }
        if (dogAmount > 0) {
            variables.push({
                type: 'PRIME_CHIEN',
                amount: dogAmount,
                description: dogEval.explanation
            });
        }
        if (nightMajorationAmount > 0) {
            variables.push({
                type: 'MAJ_NUIT',
                amount: nightMajorationAmount,
                description: `Majoration nuit (${(nightRate * 100).toFixed(0)}% sur base ${nightBaseRate} €) : ${totalNightHours.toFixed(2)}h (${rules.shortLabel})`
            });
        }
        if (sundayMajorationAmount > 0) {
            variables.push({
                type: 'MAJ_DIMANCHE',
                amount: sundayMajorationAmount,
                description: `Majoration dimanche (${(sundayRate * 100).toFixed(0)}% sur base ${sundayBaseRate} €) : ${totalSundayHours.toFixed(2)}h (${rules.shortLabel})`
            });
        }
        if (holidayMajorationAmount > 0) {
            variables.push({
                type: 'MAJ_FERIE',
                amount: holidayMajorationAmount,
                description: `Majoration jour férié (${(holidayRate * 100).toFixed(0)}%) : ${totalHolidayHours.toFixed(2)}h`
            });
        }
        if (mayFirstMajorationAmount > 0) {
            variables.push({
                type: 'MAJ_1ER_MAI',
                amount: mayFirstMajorationAmount,
                description: `Majoration légale 1er Mai (+100%) : ${mayFirstHours.toFixed(2)}h (Code du Travail L.3133-6)`
            });
        }
        if (overtime25Amount > 0) {
            variables.push({
                type: 'HEURES_SUP_25',
                amount: overtime25Amount,
                description: `Heures supplémentaires à ${(overtime25Rate * 100).toFixed(0)}% (${tier1Threshold}e à ${tier2Threshold}e h) : ${overtimeHours25.toFixed(2)}h`
            });
        }
        if (overtime50Amount > 0) {
            variables.push({
                type: 'HEURES_SUP_50',
                amount: overtime50Amount,
                description: `Heures supplémentaires à ${(overtime50Rate * 100).toFixed(0)}% (au-delà de ${tier2Threshold}h) : ${overtimeHours50.toFixed(2)}h`
            });
        }
        if (seniorityAmount > 0) {
            variables.push({
                type: 'PRIME_ANCIENNETE',
                amount: seniorityAmount,
                description: seniorityEval.explanation
            });
        }

        // 8. Trace d'audit complète WORM (Vue 2 Détail Explicatif)
        const calculationTrace = {
            engineVersion: '3.0.0-multi-convention',
            convention: {
                idcc: rules.idcc,
                label: rules.label,
                shortLabel: rules.shortLabel,
                industry: rules.industry,
                version: rules.version,
                source: rules.source,
                status: rules.status
            },
            calculatedAt: new Date().toISOString(),
            ratesSnapshot: rates,
            period,
            anomalies,
            summary: {
                totalWorkedHours: Number(totalWorkedHours.toFixed(2)),
                servicesCount: validShifts.length,
                dayHours: Number(dayHours.toFixed(2)),
                nightHours: Number(nightHours.toFixed(2)),
                sundayDayHours: Number(sundayDayHours.toFixed(2)),
                sundayNightHours: Number(sundayNightHours.toFixed(2)),
                holidayDayHours: Number(holidayDayHours.toFixed(2)),
                holidayNightHours: Number(holidayNightHours.toFixed(2)),
                sundayHolidayDayHours: Number(sundayHolidayDayHours.toFixed(2)),
                sundayHolidayNightHours: Number(sundayHolidayNightHours.toFixed(2)),
                mayFirstHours: Number(mayFirstHours.toFixed(2)),
                overtimeHours25: Number(overtimeHours25.toFixed(2)),
                overtimeHours50: Number(overtimeHours50.toFixed(2)),
                seniorityAmount,
                seniorityRate: seniorityEval.rate,
                seniorityYears: seniorityEval.years,
                basketCount,
                basketAmount,
                dressingAmount,
                dogAmount,
                baseGrossAmount,
                totalGrossAmount
            },
            weeklyOvertimeDetails,
            shiftTraces
        };

        return {
            payrollData: {
                agentId: agent.id,
                period: period.start,
                servicesCount: validShifts.length,
                totalHours: totalWorkedHours.toFixed(2),
                dayHours: dayHours.toFixed(2),
                holidayDayHours: holidayDayHours.toFixed(2),
                nightHours: nightHours.toFixed(2),
                holidayNightHours: holidayNightHours.toFixed(2),
                sundayDayHours: sundayDayHours.toFixed(2),
                sundayHolidayDayHours: sundayHolidayDayHours.toFixed(2),
                sundayNightHours: sundayNightHours.toFixed(2),
                sundayHolidayNightHours: sundayHolidayNightHours.toFixed(2),
                basketCount,
                basketAmount: basketAmount.toFixed(2),
                dogHandlerHours: totalDogHours.toFixed(2),
                dogHandlerAmount: dogAmount.toFixed(2),
                dressingAmount: dressingAmount.toFixed(2),
                overtimeHours25: overtimeHours25.toFixed(2),
                overtimeHours50: overtimeHours50.toFixed(2),
                totalGrossAmount: totalGrossAmount.toFixed(2),
                status: 'ENREGISTRE'
            },
            variables,
            evaluatedShifts,
            anomalies,
            calculationTrace
        };
    }

    /**
     * Calcule la clé de semaine ISO (ex: "2026-W24").
     * @private
     */
    getIsoWeekKey(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    }
}
