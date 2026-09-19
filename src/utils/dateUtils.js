/**
 * Standardized Date Utilities
 * Ensures consistency between Frontend and Backend
 */

export const getTodayISO = () => new Date().toISOString().split('T')[0];

export const formatDateFR = (date) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(new Date(date));
};

export const formatDateTimeFR = (date) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(date));
};

export const toISODate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
};

export const buildNumberFromFormat = (format, counter) => {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const seq = String(counter).padStart(4, '0');
    const template = format || 'YYYY-MM-XXXX';
    return template
        .replace(/YYYY/g, year)
        .replace(/MM/g, month)
        .replace(/XXXX/g, seq);
};
