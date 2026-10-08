/**
 * HRCalculationEngine.js — Moteur Central de Calcul RH, Valorisation et Prépaie
 * 
 * Responsabilité :
 * Orchestrer de bout en bout le calcul mensuel d'un collaborateur :
 * - Ingestion et validation du contrat et des vacations
 * - Découpage temporel fin via TimeSegmenter
 * - Application des règles conventionnelles IDCC 1351 via CompensationRuleEngine
 * - Calcul des heures normales, de nuit, dimanche, fériés et 1er Mai
 * - Calcul des heures supplémentaires hebdomadaires (25% et 50%)
 * - Calcul des indemnités (panier, entretien tenue, cynophile)
 * - Génération d'une trace d'audit WORM explicable et inviolable
 * 
 * Architecture :
 * 100% logique pure, testable, déterministe, zéro dépendance externe.
 * Commentaires 100 % en français.
 */

import { segmentTimeInterval } from '../segmenters/TimeSegmenter.js';
import { CompensationRuleEngine } from './CompensationRuleEngine.js';
import { getIdcc1351Rules } from '../rules/idcc1351/idcc1351Rules.js';

export class HRCalculationEngine {
    /**
     * @param {Object} [customRules=null] - Règles conventionnelles personnalisées ou par défaut
     */
    constructor(customRules = null) {
        this.rules = customRules || getIdcc1351Rules();
        this.ruleEngine = new CompensationRuleEngine(this.rules);
    }

    /**
     * Calcule la prépaie complète d'un agent pour une période donnée.
     * 
     * @param {Object} params
     * @param {Object} params.agent - Données collaborateur { id, firstName, lastName, ... }
     * @param {Object} params.contract - Données contrat { id, salary, salaryUnit, coefficient, heuresMensuelles, status }
     * @param {Array<Object>} params.shifts - Liste des vacations terrain validées
     * @param {Object} params.period - { start: 'YYYY-MM-01', end: 'YYYY-MM-31' }
     * @param {Object} [params.agencyConfig={}] - Configuration de l'agence { nightShiftStart, nightShiftEnd, holidayRegion, state }
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

        const rates = this.ruleEngine.resolveRates(contract);

        const segmenterOptions = {
            nightStart: agencyConfig.nightShiftStart || '21:00',
            nightEnd: agencyConfig.nightShiftEnd || '06:00',
            holidayRegion: agencyConfig.holidayRegion || 'FR',
            state: agencyConfig.state || null
        };

        // 1. Filtrer et ordonner les vacations éligibles (statut validé / présent)
        const validShifts = shifts.filter(s => {
            const st = (s.status || '').toUpperCase();
            // Ignorer les vacations annulées, refusées ou absentes
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
        let basketCount = 0;

        const evaluatedShifts = [];
        const shiftTraces = [];

        // Agrégation par date calendaire locale pour l'attribution des paniers (1 panier max par jour calendaire si >= 6h)
        const dailyHoursMap = new Map();
        // Pour le calcul hebdomadaire des heures supplémentaires : { 'YYYY-Wxx': totalHours }
        const weeklyHoursMap = new Map();

        // 2. Traitement vacation par vacation
        for (const shift of validShifts) {
            const shiftStart = new Date(shift.startTime);
            const shiftEnd = new Date(shift.endTime);

            if (isNaN(shiftStart.getTime()) || isNaN(shiftEnd.getTime()) || shiftEnd <= shiftStart) {
                continue;
            }

            const rawDurationHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
            totalWorkedHours += rawDurationHours;

            // Cumul par jour calendaire pour le panier repas (Accord Salaires IDCC 1351)
            const dayKey = shiftStart.toISOString().split('T')[0];
            dailyHoursMap.set(dayKey, (dailyHoursMap.get(dayKey) || 0) + rawDurationHours);

            // Suivi des heures cynophiles
            const isCyno = Boolean(shift.hasDog || shift.isCynophile || shift.dogHours);
            const dogHoursForShift = isCyno ? rawDurationHours : 0;
            totalDogHours += dogHoursForShift;

            // Découpage en tranches précises
            const segments = segmentTimeInterval(shiftStart, shiftEnd, segmenterOptions);
            const evaluatedSegments = [];

            for (const seg of segments) {
                const evalSeg = this.ruleEngine.evaluateSegment(seg, rates);
                evaluatedSegments.push(evalSeg);

                // Cumul des heures selon la catégorie
                const h = seg.durationHours;
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

            // Agrégation hebdomadaire (Semaine ISO du lundi au dimanche)
            const weekKey = this.getIsoWeekKey(shiftStart);
            weeklyHoursMap.set(weekKey, (weeklyHoursMap.get(weekKey) || 0) + rawDurationHours);

            evaluatedShifts.push({
                shiftId: shift.id,
                startTime: shiftStart.toISOString(),
                endTime: shiftEnd.toISOString(),
                durationHours: Number(rawDurationHours.toFixed(4)),
                isCynophile: isCyno,
                segments: evaluatedSegments
            });

            shiftTraces.push({
                shiftId: shift.id,
                date: dayKey,
                horaires: `${shiftStart.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${shiftEnd.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
                duree: rawDurationHours.toFixed(2),
                segmentsCount: segments.length
            });
        }

        // Évaluation des paniers repas par jour calendaire (1 panier max / jour civil si total >= 6h)
        const basketThreshold = this.rules.allowances?.basket?.thresholdHours || 6.0;
        basketCount = 0;
        for (const [, dayHoursTotal] of dailyHoursMap.entries()) {
            if (dayHoursTotal >= basketThreshold) {
                basketCount++;
            }
        }

        // 3. Calcul des Heures Supplémentaires hebdomadaires (Accord étendu IDCC 1351 du 18 mai 1993)
        // Palier 1 : de la 36e à la 47e heure incluse (+25%) -> 12 heures supplémentaires à 25% max
        // Palier 2 : au-delà de la 47e heure (+50%) -> à partir de la 48e heure
        let overtimeHours25 = 0;
        let overtimeHours50 = 0;
        const weeklyOvertimeDetails = [];
        const tier1Max = this.rules.overtime?.tier1?.maxHours || 47.0;
        const tier1Span = tier1Max - 35.0; // 12.0h selon accord du 18 mai 1993

        for (const [weekKey, weeklyTotal] of weeklyHoursMap.entries()) {
            if (weeklyTotal > 35) {
                const hs25 = Math.min(weeklyTotal - 35, tier1Span);
                const hs50 = Math.max(0, weeklyTotal - tier1Max);
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

        // 4. Calcul des montants
        // Salaire de base (mensuel fixe ou heures travaillées x taux effectif)
        const effectiveRate = rates.effectiveHourlyRate;
        const minRate = rates.minHourlyRate;

        // Base de rémunération normale
        const baseGrossAmount = Number((totalWorkedHours * effectiveRate).toFixed(2));

        // Majorations
        const totalNightHours = nightHours + sundayNightHours + holidayNightHours + sundayHolidayNightHours;
        const totalSundayHours = sundayDayHours + sundayNightHours + sundayHolidayDayHours + sundayHolidayNightHours;
        const totalHolidayHours = holidayDayHours + holidayNightHours + sundayHolidayDayHours + sundayHolidayNightHours;

        const nightMajorationAmount = Number((totalNightHours * minRate * this.rules.premiums.night.rate).toFixed(2));
        const sundayMajorationAmount = Number((totalSundayHours * minRate * this.rules.premiums.sunday.rate).toFixed(2));
        const holidayMajorationAmount = Number((totalHolidayHours * effectiveRate * this.rules.premiums.holiday.rate).toFixed(2));
        const mayFirstMajorationAmount = Number((mayFirstHours * effectiveRate * this.rules.premiums.mayFirst.rate).toFixed(2));

        const overtime25Amount = Number((overtimeHours25 * effectiveRate * 0.25).toFixed(2));
        const overtime50Amount = Number((overtimeHours50 * effectiveRate * 0.50).toFixed(2));

        // Prime d'ancienneté conventionnelle (IDCC 1351 - Article 9.03)
        const entryDate = agent.entryDate || agent.seniorityDate || agent.dateEntree || contract.startDate;
        const seniorityEval = this.ruleEngine.evaluateSeniorityAllowance({
            entryDate,
            currentDate: period.start,
            minHourlyRate: minRate,
            totalWorkedHours,
            coefficient: rates.coefficient
        });
        const seniorityAmount = seniorityEval.amount;

        // Primes & Indemnités
        const basketAmount = Number((basketCount * this.rules.allowances.basket.amount).toFixed(2));
        const dogAmount = Number((totalDogHours * this.rules.allowances.dog.hourlyAmount).toFixed(2));

        // Entretien des tenues : versé sur 11 mois par an (non versé en décembre / mois 12 par défaut conventionnel)
        const periodMonth = new Date(period.start).getMonth() + 1;
        const isExcludedMonth = (agencyConfig.dressingExcludedMonth !== undefined)
            ? agencyConfig.dressingExcludedMonth === periodMonth
            : periodMonth === 12;

        const dressingEval = isExcludedMonth
            ? { eligible: false, amount: 0, explanation: `Mois ${periodMonth} (Décembre) : exonération conventionnelle annuelle tenue (11 mois/an)` }
            : this.ruleEngine.evaluateDressingAllowance(validShifts.length);
        const dressingAmount = dressingEval.amount;

        // Total Brut
        const totalGrossAmount = Number((
            baseGrossAmount +
            nightMajorationAmount +
            sundayMajorationAmount +
            holidayMajorationAmount +
            mayFirstMajorationAmount +
            overtime25Amount +
            overtime50Amount +
            seniorityAmount +
            dressingAmount // Note : panier et chien sont des indemnités de frais non soumises
        ).toFixed(2));

        // 5. Variables de paie pour rh.payroll_variables
        const variables = [];

        if (basketCount > 0) {
            variables.push({
                type: 'PRIME_PANIER',
                amount: basketAmount,
                description: `${basketCount} panier(s) repas conventionnel(s) à ${this.rules.allowances.basket.amount} €`
            });
        }
        if (dressingAmount > 0) {
            variables.push({
                type: 'PRIME_HABILLEMENT',
                amount: dressingAmount,
                description: `Forfait mensuel conventionnel d'entretien de tenue (11 mois/an)`
            });
        }
        if (dogAmount > 0) {
            variables.push({
                type: 'PRIME_CHIEN',
                amount: dogAmount,
                description: `Prime chien : ${totalDogHours.toFixed(2)}h à ${this.rules.allowances.dog.hourlyAmount} €/h`
            });
        }
        if (nightMajorationAmount > 0) {
            variables.push({
                type: 'MAJ_NUIT',
                amount: nightMajorationAmount,
                description: `Majoration nuit (+10% sur min conv ${minRate} €) : ${totalNightHours.toFixed(2)}h`
            });
        }
        if (sundayMajorationAmount > 0) {
            variables.push({
                type: 'MAJ_DIMANCHE',
                amount: sundayMajorationAmount,
                description: `Majoration dimanche (+10% sur min conv ${minRate} €) : ${totalSundayHours.toFixed(2)}h`
            });
        }
        if (holidayMajorationAmount > 0) {
            variables.push({
                type: 'MAJ_FERIE',
                amount: holidayMajorationAmount,
                description: `Majoration jour férié (+100%) : ${totalHolidayHours.toFixed(2)}h`
            });
        }
        if (mayFirstMajorationAmount > 0) {
            variables.push({
                type: 'MAJ_1ER_MAI',
                amount: mayFirstMajorationAmount,
                description: `Majoration d'ordre public 1er Mai (+100%) : ${mayFirstHours.toFixed(2)}h`
            });
        }
        if (overtime25Amount > 0) {
            variables.push({
                type: 'HEURES_SUP_25',
                amount: overtime25Amount,
                description: `Heures supplémentaires à 25% (36e à 47e h) : ${overtimeHours25.toFixed(2)}h`
            });
        }
        if (overtime50Amount > 0) {
            variables.push({
                type: 'HEURES_SUP_50',
                amount: overtime50Amount,
                description: `Heures supplémentaires à 50% (au-delà de 47h) : ${overtimeHours50.toFixed(2)}h`
            });
        }
        if (seniorityAmount > 0) {
            variables.push({
                type: 'PRIME_ANCIENNETE',
                amount: seniorityAmount,
                description: seniorityEval.explanation
            });
        }

        // 6. Trace d'audit complète WORM
        const calculationTrace = {
            engineVersion: '2.1.0',
            conventionIdcc: this.rules.idcc,
            calculatedAt: new Date().toISOString(),
            ratesSnapshot: rates,
            period,
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
            // Objet prêt pour insertion/update dans rh.paies
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
