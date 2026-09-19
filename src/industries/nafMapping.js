export const NAF_BY_INDUSTRY = {
    security: [
        '80.10Z', '8010Z', '80.20Z', '8020Z', '80.30Z', '8030Z', '84.25Z', '8425Z',
    ],
    cleaning: [
        '81.21Z', '8121Z', '81.22Z', '8122Z', '81.29A', '8129A', '81.29B', '8129B', '81.29Z', '8129Z',
    ],
    reception: [
        '82.11Z', '8211Z', '96.09Z', '9609Z',
    ],
};

export function getIndustryFromNaf(nafCode) {
    if (!nafCode) return null;
    const normalized = nafCode.trim().toUpperCase();
    for (const [industry, codes] of Object.entries(NAF_BY_INDUSTRY)) {
        if (codes.some(c => c.toUpperCase() === normalized)) {
            return industry;
        }
    }
    return null;
}
