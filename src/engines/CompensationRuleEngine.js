/**
 * CompensationRuleEngine.js — Moteur Découplé d'Évaluation des Règles de Rémunération Multi-Conventions
 * 
 * Responsabilité :
 * Valoriser chaque segment temporel et chaque vacation selon le profil conventionnel actif
 * (résolu via ConventionRegistry), les accords d'entreprise (Niveau B) et le contrat individuel (Niveau C).
 * 
 * Principes cardinaux (Cahier des charges PILOT OS) :
 * 1. DÉTERMINISME ABSOLU & EXPLICABILITÉ DE CHAQUE CENTIME CALCULÉ.
 * 2. ISOLATION SECTORIELLE ÉTANCHE : Aucune prime ni règle de la sécurité privée n'est calculée
 *    si l'entreprise relève d'une autre convention (ex: propreté, accueil, droit commun).
 * 3. RESPECT DES BASES DE CALCUL : Distinction stricte entre CONVENTIONAL_MIN et EFFECTIVE_SALARY.
 * 4. GARDE-FOU MINIMUM : Alerte et rehaussement automatique si le salaire contractuel < minimum conventionnel.
 * 5. Commentaires 100 % en français.
 */

import { ConventionRegistry } from '../rules/ConventionRegistry.js';
import { BASE_CALCULATION_BASIS } from '../rules/ConventionRuleSchema.js';

export class CompensationRuleEngine {
    /**
     * Initialise le moteur avec un jeu de règles conventionnelles et d'entreprise.
     * @param {Object} [rules=null] - Jeu de règles résolu ou par défaut Droit Commun (Code du Travail)
     */
    constructor(rules = null) {
        this.rules = rules || ConventionRegistry.resolveRules({ idcc: '9999' });
    }

    /**
     * Résout les taux de base (conventionnel, légal et effectif) pour un contrat donné.
     * Détecte les anomalies de sous-rémunération sous le minimum conventionnel.
     * 
     * @param {Object} contract - Données du contrat
     * @returns {Object} Synthèse des taux et détection d'anomalie
     */
    resolveRates(contract) {
        const coeffRaw = contract?.coefficient;
        const grid = this.rules.salaryGrid || {};

        // Recherche du coefficient dans la grille conventionnelle active
        let gridEntry = null;
        if (coeffRaw !== undefined && coeffRaw !== null) {
            gridEntry = grid[coeffRaw] || grid[String(coeffRaw)];
        }

        // Si le coefficient n'est pas trouvé dans la grille, se replier sur le premier échelon ou sur le SMIC
        if (!gridEntry) {
            const keys = Object.keys(grid);
            if (keys.length > 0) {
                gridEntry = grid[keys[0]];
            }
        }

        const legalSmicHourly = this.rules.legalSmic?.hourlyRate || 12.02;
        const minHourlyRate = gridEntry ? gridEntry.hourlyRate : legalSmicHourly;

        const rawSalary = parseFloat(contract?.salary || 0);
        const salaryUnit = (contract?.salaryUnit || 'MOIS').toUpperCase();

        let effectiveHourlyRate = 0;
        if (salaryUnit === 'HEURE') {
            effectiveHourlyRate = rawSalary;
        } else if (salaryUnit === 'ANNEE') {
            effectiveHourlyRate = rawSalary / 12 / 151.67;
        } else {
            // Par défaut 'MOIS' : base légale 151.67 heures (35h/semaine x 52 / 12)
            effectiveHourlyRate = rawSalary > 0 ? (rawSalary / 151.67) : 0;
        }

        effectiveHourlyRate = Number(effectiveHourlyRate.toFixed(4));

        // Détection de non-conformité : salaire contractuel inférieur au minimum légal ou conventionnel
        const isBelowMinimum = effectiveHourlyRate > 0 && effectiveHourlyRate < minHourlyRate;
        const finalHourlyRate = Math.max(effectiveHourlyRate, minHourlyRate);

        return {
            coefficient: coeffRaw || (gridEntry ? Object.keys(grid)[0] : 'N/A'),
            coefficientLabel: gridEntry ? gridEntry.label : "Classification standard",
            minHourlyRate,
            contractHourlyRate: effectiveHourlyRate,
            effectiveHourlyRate: finalHourlyRate,
            isBelowMinimum,
            deficitAmount: isBelowMinimum ? Number((minHourlyRate - effectiveHourlyRate).toFixed(4)) : 0,
            salaryUnit,
            conventionIdcc: this.rules.idcc,
            conventionLabel: this.rules.shortLabel || this.rules.label
        };
    }

    /**
     * Résout la base horaire requise pour une prime ou majoration spécifique.
     * @private
     */
    _resolveBaseRateForPremium(premiumRule, rates) {
        const basis = premiumRule?.baseBasis || BASE_CALCULATION_BASIS.EFFECTIVE_SALARY;
        switch (basis) {
            case BASE_CALCULATION_BASIS.CONVENTIONAL_MIN:
                return rates.minHourlyRate;
            case BASE_CALCULATION_BASIS.LEGAL_SMIC:
                return this.rules.legalSmic?.hourlyRate || 12.02;
            case BASE_CALCULATION_BASIS.EFFECTIVE_SALARY:
            default:
                return rates.effectiveHourlyRate;
        }
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
        const { effectiveHourlyRate } = rates;

        // 1. Salaire de base pour la durée du segment
        const baseAmount = Number((durationHours * effectiveHourlyRate).toFixed(2));

        // 2. Majoration nuit
        let nightAmount = 0;
        let nightExplanation = null;
        const nightRule = this.rules.premiums?.night;
        if (segment.isNight && nightRule && nightRule.rate > 0) {
            const baseRate = this._resolveBaseRateForPremium(nightRule, rates);
            nightAmount = Number((durationHours * baseRate * nightRule.rate).toFixed(2));
            const baseName = nightRule.baseBasis === BASE_CALCULATION_BASIS.CONVENTIONAL_MIN ? "min conv." : "salaire réel";
            nightExplanation = `${durationHours.toFixed(2)}h nuit x (${baseRate} € [${baseName}] x ${(nightRule.rate * 100).toFixed(0)}%) = ${nightAmount.toFixed(2)} € (${nightRule.articleRef || 'Conventionnel'})`;
        }

        // 3. Majoration dimanche
        let sundayAmount = 0;
        let sundayExplanation = null;
        const sundayRule = this.rules.premiums?.sunday;
        if (segment.isSunday && sundayRule && sundayRule.rate > 0) {
            const baseRate = this._resolveBaseRateForPremium(sundayRule, rates);
            sundayAmount = Number((durationHours * baseRate * sundayRule.rate).toFixed(2));
            const baseName = sundayRule.baseBasis === BASE_CALCULATION_BASIS.CONVENTIONAL_MIN ? "min conv." : "salaire réel";
            sundayExplanation = `${durationHours.toFixed(2)}h dimanche x (${baseRate} € [${baseName}] x ${(sundayRule.rate * 100).toFixed(0)}%) = ${sundayAmount.toFixed(2)} € (${sundayRule.articleRef || 'Conventionnel'})`;
        }

        // 4. Majoration jour férié standard
        let holidayAmount = 0;
        let holidayExplanation = null;
        const holidayRule = this.rules.premiums?.holiday;
        if (segment.isHoliday && !segment.isMayFirst && holidayRule && holidayRule.rate > 0) {
            const baseRate = this._resolveBaseRateForPremium(holidayRule, rates);
            holidayAmount = Number((durationHours * baseRate * holidayRule.rate).toFixed(2));
            holidayExplanation = `${durationHours.toFixed(2)}h férié (${segment.holidayName || 'Férié'}) x (${baseRate} € x ${(holidayRule.rate * 100).toFixed(0)}%) = ${holidayAmount.toFixed(2)} € (${holidayRule.articleRef || 'Conventionnel'})`;
        }

        // 5. Majoration 1er Mai (Ordre public légal)
        let mayFirstAmount = 0;
        let mayFirstExplanation = null;
        const mayFirstRule = this.rules.premiums?.mayFirst;
        if (segment.isMayFirst && mayFirstRule && mayFirstRule.rate > 0) {
            const baseRate = this._resolveBaseRateForPremium(mayFirstRule, rates);
            mayFirstAmount = Number((durationHours * baseRate * mayFirstRule.rate).toFixed(2));
            mayFirstExplanation = `${durationHours.toFixed(2)}h 1er Mai x (${baseRate} € x ${(mayFirstRule.rate * 100).toFixed(0)}%) = ${mayFirstAmount.toFixed(2)} € (${mayFirstRule.articleRef || 'Code du Travail L.3133-6'})`;
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
     * Évalue les indemnités de panier selon les règles de la convention active.
     * Ne calcule de panier que si la convention en prévoit expressément un !
     * 
     * @param {Object} params
     * @param {number} params.totalShiftHours - Durée totale de la vacation
     * @param {number} [params.nightHours=0] - Durée de nuit dans la vacation
     * @returns {{ eligible: boolean, amount: number, explanation: string, type: string }}
     */
    evaluateBasket({ totalShiftHours, nightHours = 0 }) {
        const allowances = this.rules.allowances || {};

        // Cas 1 : Panier Sécurité Privée (IDCC 1351) si vacation >= threshold (6h)
        if (allowances.basket) {
            const threshold = allowances.basket.thresholdHours || 6.0;
            const amount = allowances.basket.amount || 4.48;
            if (totalShiftHours >= threshold) {
                return {
                    eligible: true,
                    amount,
                    type: 'INDEMNITE_PANIER',
                    explanation: `Vacation de ${totalShiftHours.toFixed(2)}h >= ${threshold}h -> Panier conventionnel de ${amount.toFixed(2)} € net (${allowances.basket.articleRef || 'IDCC 1351'})`
                };
            }
            return {
                eligible: false,
                amount: 0,
                type: 'INDEMNITE_PANIER',
                explanation: `Vacation de ${totalShiftHours.toFixed(2)}h < ${threshold}h -> Pas d'indemnité de panier`
            };
        }

        // Cas 2 : Panier de nuit Propreté (IDCC 3173) si >= thresholdNightHours (4h de nuit)
        if (allowances.nightBasket) {
            const thresholdNight = allowances.nightBasket.thresholdNightHours || 4.0;
            const amount = allowances.nightBasket.amount || 3.80;
            if (nightHours >= thresholdNight) {
                return {
                    eligible: true,
                    amount,
                    type: 'INDEMNITE_PANIER_NUIT',
                    explanation: `Travail de nuit de ${nightHours.toFixed(2)}h >= ${thresholdNight}h -> Panier de nuit de ${amount.toFixed(2)} € net (${allowances.nightBasket.articleRef || 'IDCC 3173'})`
                };
            }
            return {
                eligible: false,
                amount: 0,
                type: 'INDEMNITE_PANIER_NUIT',
                explanation: `Heures de nuit (${nightHours.toFixed(2)}h) < ${thresholdNight}h -> Pas de panier de nuit`
            };
        }

        // Cas 3 : Aucune indemnité de panier dans la convention active
        return {
            eligible: false,
            amount: 0,
            type: 'AUCUN',
            explanation: `Convention ${this.rules.shortLabel || this.rules.idcc} : aucune prime de panier applicable`
        };
    }

    /**
     * Évalue l'indemnité horaire cynophile (chien).
     * Strictement réservée aux conventions le prévoyant (ex: IDCC 1351).
     * 
     * @param {number} dogHours - Heures travaillées avec chien
     * @returns {{ amount: number, explanation: string }}
     */
    evaluateDogAllowance(dogHours) {
        if (!dogHours || dogHours <= 0) return { amount: 0, explanation: "Aucune heure cynophile" };

        const dogRule = this.rules.allowances?.dog;
        if (!dogRule) {
            return {
                amount: 0,
                explanation: `Convention ${this.rules.shortLabel || this.rules.idcc} : aucune indemnité cynophile prévue par cette branche`
            };
        }

        const rate = dogRule.hourlyAmount || 1.41;
        const amount = Number((dogHours * rate).toFixed(2));
        return {
            amount,
            explanation: `${dogHours.toFixed(2)}h cynophile x ${rate} €/h = ${amount.toFixed(2)} € net (${dogRule.articleRef || 'IDCC 1351'})`
        };
    }

    /**
     * Évalue l'indemnité mensuelle d'entretien de tenue.
     * Réservée aux conventions le prévoyant (ex: IDCC 1351 ou IDCC 2098).
     * 
     * @param {number} shiftsCount - Nombre de vacations travaillées dans le mois
     * @returns {{ eligible: boolean, amount: number, explanation: string, type: string }}
     */
    evaluateDressingAllowance(shiftsCount) {
        const allowances = this.rules.allowances || {};

        // Cas Sécurité Privée (IDCC 1351)
        if (allowances.dressing) {
            const monthlyAmount = allowances.dressing.monthlyAmount || 8.78;
            if (shiftsCount > 0) {
                return {
                    eligible: true,
                    amount: monthlyAmount,
                    type: 'INDEMNITE_TENUE_SECURITE',
                    explanation: `Collaborateur actif (${shiftsCount} vacation(s)) -> Forfait tenue sécurité mensuel de ${monthlyAmount.toFixed(2)} € (${allowances.dressing.articleRef || 'IDCC 1351'})`
                };
            }
        }

        // Cas Accueil & Tertiaire (IDCC 2098)
        if (allowances.uniformMaintenance) {
            const monthlyAmount = allowances.uniformMaintenance.monthlyAmount || 15.00;
            if (shiftsCount > 0) {
                return {
                    eligible: true,
                    amount: monthlyAmount,
                    type: 'INDEMNITE_TENUE_ACCUEIL',
                    explanation: `Collaborateur actif (${shiftsCount} vacation(s)) -> Forfait tenue accueil de ${monthlyAmount.toFixed(2)} € (${allowances.uniformMaintenance.articleRef || 'IDCC 2098'})`
                };
            }
        }

        return {
            eligible: false,
            amount: 0,
            type: 'AUCUN',
            explanation: `Convention ${this.rules.shortLabel || this.rules.idcc} : aucun forfait d'entretien de tenue applicable`
        };
    }

    /**
     * Évalue la prime d'ancienneté conventionnelle selon les tranches de la convention active.
     */
    evaluateSeniorityAllowance({ entryDate, currentDate, minHourlyRate, totalWorkedHours, coefficient }) {
        const seniorityRule = this.rules.seniority;
        if (!seniorityRule || !seniorityRule.tiers || seniorityRule.tiers.length === 0) {
            return {
                eligible: false,
                rate: 0,
                years: 0,
                amount: 0,
                explanation: `Convention ${this.rules.shortLabel || this.rules.idcc} : pas de prime d'ancienneté conventionnelle obligatoire`
            };
        }

        // Pour la sécurité privée, exclure les cadres (>= 300)
        if (this.rules.idcc === '1351' && Number(coefficient) >= 300) {
            return {
                eligible: false,
                rate: 0,
                years: 0,
                amount: 0,
                explanation: `Cadre (coeff ${coefficient}) : non éligible à la prime d'ancienneté conventionnelle (${seniorityRule.articleRef})`
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
        for (const t of seniorityRule.tiers) {
            if (years >= t.minYears) {
                rate = t.rate;
                tierLabel = t.label;
                break;
            }
        }

        if (rate > 0) {
            const amount = Number((totalWorkedHours * minHourlyRate * rate).toFixed(2));
            return {
                eligible: true,
                rate,
                years: Number(years.toFixed(2)),
                amount,
                explanation: `Ancienneté ${years.toFixed(1)} ans (${tierLabel}) : ${totalWorkedHours.toFixed(2)}h x ${minHourlyRate} € x ${(rate * 100).toFixed(0)}% = ${amount.toFixed(2)} € (${seniorityRule.articleRef})`
            };
        }

        const minThreshold = seniorityRule.tiers[seniorityRule.tiers.length - 1]?.minYears || 1;
        return {
            eligible: false,
            rate: 0,
            years: Number(years.toFixed(2)),
            amount: 0,
            explanation: `Ancienneté de ${years.toFixed(1)} ans < ${minThreshold} ans -> Pas de prime d'ancienneté`
        };
    }
}
