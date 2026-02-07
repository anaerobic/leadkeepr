/**
 * Base configuration and utilities for AWS service wrappers
 * Provides common error handling and metrics patterns
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { executeWithErrorHandling } from '../utils/error-handling/core';
import { createStandardMetrics } from '../utils/metrics-helpers';

/**
 * Base configuration for all AWS service wrappers
 */
export interface AwsWrapperConfig {
  logger: Logger;
  metrics?: Metrics;
  context?: Record<string, unknown>;
}

/**
 * Create a standardized AWS operation executor with error handling and metrics
 */
export function createAwsOperationExecutor(servicePrefix: string, config: AwsWrapperConfig) {
  return function executeOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    additionalContext?: Record<string, unknown>
  ) {
    return executeWithErrorHandling(operation, {
      logger: config.logger,
      metrics: config.metrics,
      operation: `${servicePrefix}${operationName}`,
      context: {
        ...config.context,
        ...additionalContext,
      },
      metricPrefix: servicePrefix,
      retryable: true,
    });
  };
}

/**
 * Create standard metrics helper for AWS operations
 */
export function createAwsMetricsHelper(config: AwsWrapperConfig) {
  return config.metrics ? createStandardMetrics({ metrics: config.metrics }) : null;
}
