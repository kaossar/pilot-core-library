/**
 * vitest.config.js — Configuration Vitest pour pilot-core-library
 *
 * Tous les calculateurs, segmenters, générateurs et moteurs sont désormais unifiés sous Vitest v3+.
 */
export default {
    test: {
        include: ['src/**/*.test.js'],
        environment: 'node',
    },
};
