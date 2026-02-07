import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';

/**
 * AWS Lambda Powertools Mock Utilities
 *
 * Provides standardized mock instances for Logger and Metrics to eliminate
 * duplication across test files. All test files can use these pre-configured
 * mocks instead of creating their own instances.
 */

/**
 * Creates a properly typed mock Logger instance
 * @returns Mocked Logger with all methods stubbed
 */
export function createMockLogger(): jest.Mocked<Logger> {
  return new Logger() as jest.Mocked<Logger>;
}

/**
 * Creates a properly typed mock Metrics instance
 * @returns Mocked Metrics with all methods stubbed
 */
export function createMockMetrics(): jest.Mocked<Metrics> {
  return new Metrics() as jest.Mocked<Metrics>;
}

/**
 * Creates both Logger and Metrics mocks together
 * @returns Object containing both mockLogger and mockMetrics
 */
export function createMockPowertools(): {
  mockLogger: jest.Mocked<Logger>;
  mockMetrics: jest.Mocked<Metrics>;
} {
  return {
    mockLogger: createMockLogger(),
    mockMetrics: createMockMetrics(),
  };
}
