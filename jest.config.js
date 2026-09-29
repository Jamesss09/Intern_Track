/**
 * Jest configuration.
 *
 * `jest-expo` is the preset Expo ships for exactly this, so the transform and
 * module resolution match what Metro does at runtime. That is the whole point:
 * a test that passes under a different resolver than the app uses is a test
 * about a different program. → [[Decisions#D-011 — Verify every Expo API against the installed SDK]]
 *
 * `react-test-renderer` is deliberately absent. It is only needed to *render*
 * a component, and nothing here does — see `Roadmap` -> "Phase 2 — Pure
 * Utilities". The pinned React 19.2.3 has no matching published
 * `react-test-renderer` at the version npm resolves by default, so pulling it in
 * for zero current benefit would mean either a peer-dependency override or a
 * version skew between React and its renderer. Add it with the component tests
 * that actually need it.
 *
 * `testEnvironment: 'node'` because every test target is a pure function in
 * `utils/`. The React Native DOM shims the preset installs would only add
 * startup cost, and a test that accidentally reached for `Alert` or a native
 * module should fail loudly rather than pass against a mock.
 */

module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',

  // Mirrors the `@/*` alias in tsconfig.json. `babel-preset-expo` also rewrites
  // these at transform time, but the mapper is what makes the path resolvable
  // for anything that reaches Jest's resolver before the transform runs.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],

  // `utils/` is the dependency-free layer, so it is the only place worth
  // measuring until there is a test to measure against.
  collectCoverageFrom: ['<rootDir>/src/utils/**/*.ts', '!<rootDir>/src/utils/**/*.test.ts'],

  clearMocks: true,
};
