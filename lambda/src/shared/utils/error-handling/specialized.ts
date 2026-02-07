/**
 * Specialized error handlers for specific use cases
 */

import { executeWithErrorHandling } from './core';
import { ErrorHandlingConfig, ErrorHandlingResult } from './types';

/**
 * Wrapper for AWS service operations with standardized error handling
 * @param operation The AWS operation to execute
 * @param config Error handling configuration
 * @returns Operation result
 */
export async function executeAwsOperation<TResult>(
  operation: () => Promise<TResult>,
  config: ErrorHandlingConfig & {
    serviceName: string; // AWS service name (e.g., 'DynamoDB', 'S3')
    operationType: string; // Operation type (e.g., 'GetItem', 'PutObject')
  }
): Promise<ErrorHandlingResult<TResult>> {
  return executeWithErrorHandling(operation, {
    ...config,
    operation: `${config.serviceName}${config.operationType}`,
    metricPrefix: config.metricPrefix || `${config.serviceName}${config.operationType}`,
    context: {
      ...config.context,
      serviceName: config.serviceName,
      operationType: config.operationType,
    },
  });
}

/**
 * Standard error handler for repository operations
 * @param operation The repository operation to execute
 * @param config Error handling configuration
 * @returns Operation result with null on error (common repository pattern)
 */
export async function executeRepositoryOperation<TResult>(
  operation: () => Promise<TResult>,
  config: ErrorHandlingConfig
): Promise<TResult | null> {
  const result = await executeWithErrorHandling(operation, {
    ...config,
    retryable: true, // Repository operations are usually retryable
  });

  // Repository pattern: return null on error rather than throwing
  return result.success ? result.data! : null;
}

/**
 * Execute multiple operations in sequence with consolidated error handling
 * @param operations Array of operations to execute
 * @param config Base error handling configuration
 * @returns Array of operation results
 */
export async function executeOperationsSequentially<TResult = unknown>(
  operations: Array<{
    operation: () => Promise<TResult>;
    name: string;
    context?: Record<string, unknown>;
  }>,
  config: Omit<ErrorHandlingConfig, 'operation' | 'context'>
): Promise<ErrorHandlingResult<TResult>[]> {
  const results: ErrorHandlingResult<TResult>[] = [];

  for (const { operation, name, context } of operations) {
    const result = await executeWithErrorHandling(operation, {
      ...config,
      operation: name,
      context,
    });
    results.push(result);

    // Stop on first failure if not retryable
    if (!result.success && !result.retryable) {
      break;
    }
  }

  return results;
}
