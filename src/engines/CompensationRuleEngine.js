/**
 * CompensationRuleEngine.js — Moteur d'évaluation et de valorisation des règles de rémunération
 * 
 * Responsabilité :
 * Valoriser chaque segment temporel et chaque vacation selon les règles conventionnelles (IDCC 1351),
 * les accords applicables et le contrat individuel du collaborateur.
 * 
 * Principes stricts :
 * 1. Déterminisme absolu et traçabilité de chaque centime.
 * 2. Les majorations de nuit et dimanche sont assises sur le MINIMUM CONVENTIONNEL.
 * 3. Les majorations de jours fériés et du 1er Mai sont assises sur le SALAIRE CONTRACTUEL EFFECTIF.
 * 4. Commentaires 100 % en français.
 */

import { getIdcc1351Rules } from '../rules/idcc1351/idcc1351Rules.js';

export class CompensationRuleEngine {
    /**
     * Initialise le moteur avec un jeu de règles conventionnelles et d'entreprise.
     * @param {Object} [rules=null] - Jeu de règles (par défaut IDCC 1351 applicable)
     */
    constructor(rules = null) {
        this.rules = rules || getIdcc1351Rules();
    }

    /**
     * Résout les taux de base (conventionnel et effectif) pour un contrat donné.
     * 
     * @param {Object} contract - Données du contrat
     * @param {number|string} contract.coefficient - Coefficient conventionnel (ex: 140)
     * @param {number|string} contract.salary - Salaire contractuel
     * @param {string} [contract.salaryUnit='MOIS'] - 'MOIS' | 'HEURE' | 'ANNEE'
     * @returns {Object} { minHourlyRate, effectiveHourlyRate, coefficient, isBelowMinimum }
     */
    resolveRates(contract) {
        const coeff = Number(contract?.coefficient || 120);
        const gridEntry = this.rules.salaryGrid[coeff] || this.rules.salaryGrid[120];
        const minHourlyRate = gridEntry ? gridEntry.hourlyRate : this.rules.legalSmic.hourlyRate;

        const rawSalary = parseFloat(contract?.salary || 0);
        const salaryUnit = contract?.salaryUnit || 'MOIS';

        let effectiveHourlyRate = 0;
        if (salaryUnit === 'HEURE') {
            effectiveHourlyRate = rawSalary;
        } else if (salaryUnit === 'ANNEE') {
            effectiveHourlyRate = rawSalary / 12 / 151.67;
        } else {
            // Par défaut 'MOIS' : base légale 151.67 heures (35h/semaine * 52 / 12)
            effectiveHourlyRate = rawSalary / 151.67;
        }

        effectiveHourlyRate = Number(effectiveHourlyRate.toFixed(4));

        // Détection de non-conformité : salaire contractuel inférieur au minimum légal ou conventionnel
        const isBelowMinimum = effectiveHourlyRate < minHourlyRate;
        const finalHourlyRate = Math.max(effectiveHourlyRate, minHourlyRate);

        return {
            coefficient: coeff,
            coefficientLabel: gridEntry ? gridEntry.label : "Indéterminé",
            minHourlyRate,
            contractHourlyRate: effectiveHourlyRate,
            effectiveHourlyRate: finalHourlyRate,
            isBelowMinimum,
            salaryUnit
        };
    }

    /**
     * Valorise un segment temporel homogène.
     * 
     * @param {Object} segment - Segment produit par TimeSegmenter
     * @param {Object} rates - Taux résolus par resolveRates
     * @returns {Object} Détail financier et explicatif du segment
     */
    evaluateSegment(segment, rates) {
        const { durationHours } = segment;
        const { minHourlyRate, effectiveHourlyRate } = rates;

        // 1. Salaire de base pour la durée du segment
        const baseAmount = Number((durationHours * effectiveHourlyRate).toFixed(2));

        // 2. Majoration nuit (+10% sur le minimum conventionnel)
        let nightAmount = 0;
        let nightExplanation = null;
        if (segment.isNight) {
            const nightRate = this.rules.premiums.night.rate;
            nightAmount = Number((durationHours * minHourlyRate * nightRate).toFixed(2));
            nightExplanation = `${durationHours.toFixed(2)}h nuit x (${minHourlyRate} € x ${nightRate * 100}%) = ${nightAmount.toFixed(2)} € (${this.rules.premiums.night.articleRef})`;
        }

        // 3. Majoration dimanche (+10% sur le minimum conventionnel)
        let sundayAmount = 0;
        let sundayExplanation = null;
        if (segment.isSunday) {
            const sundayRate = this.rules.premiums.sunday.rate;
            sundayAmount = Number((durationHours * minHourlyRate * sundayRate).toFixed(2));
            sundayExplanation = `${durationHours.toFixed(2)}h dimanche x (${minHourlyRate} € x ${sundayRate * 100}%) = ${sundayAmount.toFixed(2)} € (${this.rules.premiums.sunday.articleRef})`;
        }

        // 4. Majoration jour férié standard (+100% sur le salaire effectif)
        let holidayAmount = 0;
        let holidayExplanation = null;
        if (segment.isHoliday && !segment.isMayFirst) {
            const holidayRate = this.rules.premiums.holiday.rate;
            holidayAmount = Number((durationHours * effectiveHourlyRate * holidayRate).toFixed(2));
            holidayExplanation = `${durationHours.toFixed(2)}h férié (${segment.holidayName || 'Férié'}) x (${effectiveHourlyRate} € x ${holidayRate * 100}%) = ${holidayAmount.toFixed(2)} € (${this.rules.premiums.holiday.articleRef})`;
        }

        // 5. Majoration 1er Mai (+100% légal d'ordre public sur le salaire effectif)
        let mayFirstAmount = 0;
        let mayFirstExplanation = null;
        if (segment.isMayFirst) {
            const mayFirstRate = this.rules.premiums.mayFirst.rate;
            mayFirstAmount = Number((durationHours * effectiveHourlyRate * mayFirstRate).toFixed(2));
            mayFirstExplanation = `${durationHours.toFixed(2)}h 1er Mai x (${effectiveHourlyRate} € x ${mayFirstRate * 100}%) = ${mayFirstAmount.toFixed(2)} € (${this.rules.premiums.mayFirst.articleRef})`;
        }

        const totalSegmentGross = Number((baseAmount + nightAmount + sundayAmount + holidayAmount + mayFirstAmount).toFixed(2));

        return {
            segmentStart: segment.start,
            segmentEnd: segment.end,
            durationHours,
            category: segment.category,
            baseAmount,
            nightAmount,
            nightExplanation,
            sundayAmount,
            sundayExplanation,
            holidayAmount,
            holidayExplanation,
            mayFirstAmount,
            mayFirstExplanation,
            totalSegmentGross
        };
    }

    /**
     * Évalue l'indemnité de panier pour une vacation complète.
     * @param {number} totalShiftHours - Durée totale de la vacation en heures
     * @returns {{ eligible: boolean, amount: number, explanation: string }}
     */
    evaluateBasket(totalShiftHours) {
        const threshold = this.rules.allowances.basket.thresholdHours;
        const amount = this.rules.allowances.basket.amount;

        if (totalShiftHours >= threshold) {
            return {
                eligible: true,
                amount,
                explanation: `Vacation de ${totalShiftHours.toFixed(2)}h >= ${threshold}h -> Panier conventionnel de ${amount.toFixed(2)} € net`
            };
        }

        return {
            eligible: false,
            amount: 0,
            explanation: `Vacation de ${totalShiftHours.toFixed(2)}h < ${threshold}h -> Pas de panier`
        };
    }

    /**
     * Évalue l'indemnité horaire d'entretien de chien (cynophile).
     * @param {number} dogHours - Heures travaillées avec chien
     * @returns {{ amount: number, explanation: string }}
     */
    evaluateDogAllowance(dogHours) {
        if (!dogHours || dogHours <= 0) return { amount: 0, explanation: "Aucune heure cynophile" };

        const rate = this.rules.allowances.dog.hourlyAmount;
        const amount = Number((dogHours * rate).toFixed(2));
        return {
            amount,
            explanation: `${dogHours.toFixed(2)}h cynophile x ${rate} €/h = ${amount.toFixed(2)} € net`
        };
    }

    /**
     * Évalue l'indemnité mensuelle forfaitaire d'entretien des tenues.
     * @param {number} shiftsCount - Nombre de vacations travaillées dans le mois
     * @returns {{ eligible: boolean, amount: number, explanation: string }}
     */
    evaluateDressingAllowance(shiftsCount) {
        const monthlyAmount = this.rules.allowances.dressing.monthlyAmount;
        if (shiftsCount > 0) {
            return {
                eligible: true,
                amount: monthlyAmount,
                explanation: `Collaborateur actif (${shiftsCount} vacation(s)) -> Forfait tenue mensuel de ${monthlyAmount.toFixed(2)} € net (11 mois/an)`
            };
        }

        return {
            eligible: false,
            amount: 0,
            explanation: "Aucune vacation réalisée sur la période -> Pas d'indemnité de tenue"
        };
    }

    /**
     * Évalue la prime d'ancienneté conventionnelle obligatoire (IDCC 1351 - Article 9.03).
     * Assise sur le salaire minimal conventionnel du coefficient de l'agent.
     * 
     * @param {Object} params
     * @param {string|Date} [params.entryDate] - Date d'embauche ou d'ancienneté du salarié
     * @param {string|Date} [params.currentDate] - Date d'effet du calcul
     * @param {number} params.minHourlyRate - Salaire minimum conventionnel du coefficient
     * @param {number} params.totalWorkedHours - Heures travaillées dans la période
     * @param {number} [params.coefficient=140] - Coefficient conventionnel
     * @returns {{ eligible: boolean, rate: number, years: number, amount: number, explanation: string }}
     */
    evaluateSeniorityAllowance({ entryDate, currentDate, minHourlyRate, totalWorkedHours, coefficient = 140 }) {
        // Exclure les cadres (coefficients >= 300 selon la nomenclature IDCC 1351)
        if (Number(coefficient) >= 300) {
            return {
                eligible: false,
                rate: 0,
                years: 0,
                amount: 0,
                explanation: `Cadre (coeff ${coefficient}) : non éligible à la prime d'ancienneté conventionnelle (Art. 9.03)`
            };
        }

        if (!entryDate) {
            return {
                eligible: false,
                rate: 0,
                years: 0,
                amount: 0,
                explanation: "Date d'embauche non renseignée -> Prime d'ancienneté non calculée"
            };
        }

        const dEntry = new Date(entryDate);
        const dCurrent = currentDate ? new Date(currentDate) : new Date();
        if (isNaN(dEntry.getTime()) || isNaN(dCurrent.getTime()) || dCurrent < dEntry) {
            return { eligible: false, rate: 0, years: 0, amount: 0, explanation: "Date d'embauche invalide" };
        }

        const diffMs = dCurrent.getTime() - dEntry.getTime();
        const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);

        let rate = 0;
        let tierLabel = null;
        const tiers = this.rules.seniority?.tiers || [
            { minYears: 15, rate: 0.12, label: "+12% après 15 ans" },
            { minYears: 12, rate: 0.10, label: "+10% après 12 ans" },
            { minYears: 10, rate: 0.08, label: "+8% après 10 ans" },
            { minYears: 7,  rate: 0.05, label: "+5% après 7 ans" },
            { minYears: 4,  rate: 0.02, label: "+2% après 4 ans" }
        ];

        for (const t of tiers) {
            if (years >= t.minYears) {
                rate = t.rate;
                tierLabel = t.label;
                break;
            }
        }

        if (rate > 0) {
            // Assise : minimum conventionnel x total des heures travaillées (Art. 9.03)
            const amount = Number((totalWorkedHours * minHourlyRate * rate).toFixed(2));
            return {
                eligible: true,
                rate,
                years: Number(years.toFixed(2)),
                amount,
                explanation: `Ancienneté ${years.toFixed(1)} ans (${tierLabel}) : ${totalWorkedHours.toFixed(2)}h x ${minHourlyRate} € x ${(rate * 100)}% = ${amount.toFixed(2)} € (Art. 9.03 IDCC 1351)`
            };
        }

        return {
            eligible: false,
            rate: 0,
            years: Number(years.toFixed(2)),
            amount: 0,
            explanation: `Ancienneté de ${years.toFixed(1)} ans < 4 ans -> Pas de prime d'ancienneté (seuil minimal 4 ans)`
        };
    }
}
