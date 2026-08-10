/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 60000,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      globalSetup: '<rootDir>/test/integration/global-setup.ts',
      globalTeardown: '<rootDir>/test/integration/global-teardown.ts',
    },
    {
      displayName: 'e2e',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/e2e/global-setup.ts',
      globalTeardown: '<rootDir>/test/e2e/global-teardown.ts',
    },
  ],
};
