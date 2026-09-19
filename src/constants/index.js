export * from './formesJuridiques.js';
export * from './idcc1351.js';
export * from './contractEnums.js';
export const DAYS_OF_WEEK = [
    { id: 1, label: 'L', labelKey: 'days.short.mon', nameKey: 'days.long.mon' },
    { id: 2, label: 'M', labelKey: 'days.short.tue', nameKey: 'days.long.tue' },
    { id: 3, label: 'M', labelKey: 'days.short.wed', nameKey: 'days.long.wed' },
    { id: 4, label: 'J', labelKey: 'days.short.thu', nameKey: 'days.long.thu' },
    { id: 5, label: 'V', labelKey: 'days.short.fri', nameKey: 'days.long.fri' },
    { id: 6, label: 'S', labelKey: 'days.short.sat', nameKey: 'days.long.sat' },
    { id: 0, label: 'D', labelKey: 'days.short.sun', nameKey: 'days.long.sun' },
];

export const getMonthsOptions = (t) => [
    { value: 1, label: t ? t('payrolls.months.1') : 'Janvier' },
    { value: 2, label: t ? t('payrolls.months.2') : 'Février' },
    { value: 3, label: t ? t('payrolls.months.3') : 'Mars' },
    { value: 4, label: t ? t('payrolls.months.4') : 'Avril' },
    { value: 5, label: t ? t('payrolls.months.5') : 'Mai' },
    { value: 6, label: t ? t('payrolls.months.6') : 'Juin' },
    { value: 7, label: t ? t('payrolls.months.7') : 'Juillet' },
    { value: 8, label: t ? t('payrolls.months.8') : 'Août' },
    { value: 9, label: t ? t('payrolls.months.9') : 'Septembre' },
    { value: 10, label: t ? t('payrolls.months.10') : 'Octobre' },
    { value: 11, label: t ? t('payrolls.months.11') : 'Novembre' },
    { value: 12, label: t ? t('payrolls.months.12') : 'Décembre' }
];

export const UNITS = [
    { value: 'forfait', singular: 'Forfait', plural: 'Forfaits' },
    { value: 'h', singular: 'Heure', plural: 'Heures' },
    { value: 'j', singular: 'Jour', plural: 'Jours' },
    { value: 'semaine', singular: 'Semaine', plural: 'Semaines' },
    { value: 'mois', singular: 'Mois', plural: 'Mois' },
    { value: 'an', singular: 'Année', plural: 'Années' },
    { value: 'kg', singular: 'Kg', plural: 'Kg' },
    { value: 'g', singular: 'g', plural: 'g' },
    { value: 't', singular: 't', plural: 't' },
    { value: 'm', singular: 'm', plural: 'm' },
    { value: 'km', singular: 'km', plural: 'km' },
    { value: 'm2', singular: 'm²', plural: 'm²' },
    { value: 'm3', singular: 'm³', plural: 'm³' },
    { value: 'l', singular: 'L', plural: 'L' },
    { value: 'u', singular: 'Unité', plural: 'Unités' },
    { value: 'piece', singular: 'Pièce', plural: 'Pièces' },
    { value: 'lot', singular: 'Lot', plural: 'Lots' }
];

export const TVA_RATES = [0, 2.1, 5.5, 10, 20];
