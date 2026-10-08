/**
 * vitest.config.js — Configuration Vitest pour pilot-core-library
 *
 * Les fichiers dans calculators/ et generators/ utilisent node:test.
 * Seuls les moteurs engines/ utilisent vitest.
 */
export default {
    test: {
        include  : ['src/engines/**/*.test.js'],
        exclude  : ['src/calculators/**', 'src/generators/**'],
        environment: 'node',
    },
};
