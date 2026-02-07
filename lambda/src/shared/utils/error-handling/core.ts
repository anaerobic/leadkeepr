/**
 * Core error handling functions with standardized logging and metrics
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { ErrorHandlingConfig, ErrorHandlingResult } from './types';

export async function executeWithErrorHandling<TResult>(
  operation: () => Promise<TResult>,
  config: ErrorHandlingConfig
): Promise<ErrorHandlingResult<TResult>> {
  const startTime = Date.now();
  const {
    logger,
    metrics,
    operation: operationName,
    context = {},
    retryable = false,
    metricPrefix,
  } = config;

  try {
    logger.debug(`Starting ${operationName}`, context);

    const result = await operation();
    const duration = Date.now() - startTime;

    // Log success metrics
    if (metrics) {
      const prefix = metricPrefix || operationName;
      metrics.addMetric(`${prefix}Success`, MetricUnit.Count, 1);
      metrics.addMetric(`${prefix}Duration`, MetricUnit.Milliseconds, duration);
    }

    // Truncate result for logging to prevent large log entries
    const truncatedResult = truncateForLogging(result);

    logger.debug(`${operationName} completed successfully`, {
      ...context,
      duration,
      result: truncatedResult,
    });

    return {
      success: true,
      data: result,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log error metrics
    if (metrics) {
      const prefix = metricPrefix || operationName;
      metrics.addMetric(`${prefix}Error`, MetricUnit.Count, 1);
      metrics.addMetric(`${prefix}ErrorDuration`, MetricUnit.Milliseconds, duration);
    }

    logger.error(`${operationName} failed`, {
      error: errorMessage,
      ...context,
      duration,
      retryable,
    });

    return {
      success: false,
      error: error as Error,
      duration,
      retryable,
    };
  }
}

/**
 * Execute an operation with error handling that throws on failure
 * Use this when you want the convenience of error handling but need to maintain throw behavior
 * @param operation The async operation to execute
 * @param config Error handling configuration
 * @returns The operation result (throws on error)
 */
export async function executeWithErrorHandlingThrow<TResult>(
  operation: () => Promise<TResult>,
  config: ErrorHandlingConfig
): Promise<TResult> {
  const result = await executeWithErrorHandling(operation, config);

  if (!result.success) {
    throw result.error;
  }

  return result.data!;
}

/**
 * Execute an operation with standardized error handling, logging, and metrics
 * @param operation The async operation to execute
 * @param config Error handling configuration
 * @returns Operation result with success/error information
 */
/**
 * Truncate result for logging to prevent large log entries
 * If result is a string, take first 50 characters
 * If result is an object, take max 50 characters from each field
 */
function truncateForLogging(result: unknown): unknown {
  if (typeof result === 'string') {
    return result.length > 50 ? result.substring(0, 50) + '...' : result;
  }

  if (result && typeof result === 'object' && result !== null) {
    const truncated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string') {
        truncated[key] = value.length > 50 ? value.substring(0, 50) + '...' : value;
      } else {
        truncated[key] = value;
      }
    }
    return truncated;
  }

  return result;
}
