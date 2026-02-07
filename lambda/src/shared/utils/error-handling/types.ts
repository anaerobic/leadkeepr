/**
 * Core error handling types and configuration
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';

/**
 * Configuration for error handling
 */
export interface ErrorHandlingConfig {
  logger: Logger;
  metrics?: Metrics;
  operation: string; // Name of the operation for logging and metrics
  context?: Record<string, unknown>; // Additional context for logging
  retryable?: boolean; // Whether the error should be retried
  metricPrefix?: string; // Prefix for error metrics (default: operation name)
}

/**
 * Result of an operation with error handling
 */
export interface ErrorHandlingResult<TSuccess = unknown, TError = Error> {
  success: boolean;
  data?: TSuccess;
  error?: TError;
  duration?: number;
  retryable?: boolean;
}
