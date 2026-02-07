module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  projects: [
    {
      displayName: 'cdk',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/cdk/lib'],
      testMatch: ['**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: './cdk/tsconfig.json',
          },
        ],
      },
      collectCoverageFrom: ['cdk/lib/**/*.ts', '!cdk/lib/**/*.d.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/cdk.out/', '/dist/'],
    },
    {
      displayName: 'lambda',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/lambda/src'],
      testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
      testPathIgnorePatterns: [
        '/node_modules/',
        '.*\\.util\\.ts$',
        '.*-helpers\\.ts$',
        '.*-helpers\\.util\\.ts$',
      ],
      moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
      moduleNameMapper: {
        '^@middy/core$': '<rootDir>/node_modules/@middy/core',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: './lambda/tsconfig.json',
            useESM: true,
          },
        ],
      },
      transformIgnorePatterns: ['node_modules/(?!@middy)'],
      collectCoverageFrom: ['lambda/src/**/*.ts', '!lambda/src/**/*.d.ts'],
    },
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'cdk/lib/**/*.ts',
    'lambda/*/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/cdk.out/**',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/cdk.out/', '/dist/', '/coverage/'],
};
