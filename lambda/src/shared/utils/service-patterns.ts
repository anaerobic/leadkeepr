/**
 * Shared patterns for service error handling and metrics
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';

/**
 * Standard service response interface
 */
export interface ServiceResponse {
  success: boolean;
  message: string;
}

/**
 * Configuration for service operation tracking
 */
export interface ServiceOperationConfig {
  operationName: string;
  successMetric: string;
  errorMetric: string;
  logger: Logger;
  metrics: Metrics;
}

/**
 * Extract error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Execute a service operation with standardized error handling and metrics
 */
export async function executeServiceOperation<T extends ServiceResponse>(
  config: ServiceOperationConfig,
  operation: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  try {
    const result = await operation();
    
    if (result.success) {
      config.logger.info(`${config.operationName} completed successfully`, context || {});
      config.metrics.addMetric(config.successMetric, 'Count', 1);
    } else {
      config.logger.warn(`${config.operationName} completed with failure`, {
        ...(context || {}),
        message: result.message,
      });
    }
    
    return result;
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    
    config.logger.error(`Error during ${config.operationName}`, {
      ...(context || {}),
      error: errorMessage,
    });
    
    config.metrics.addMetric(config.errorMetric, 'Count', 1);
    
    return {
      success: false,
      message: `An error occurred during ${config.operationName.toLowerCase()}.`,
    } as T;
  }
}

/**
 * Execute operation with success/failure logging and metrics but without try/catch
 * Useful when you want to handle errors at a higher level but still track metrics
 */
export function trackServiceOperation<T extends ServiceResponse>(
  config: ServiceOperationConfig,
  result: T,
  context?: Record<string, any>
): T {
  if (result.success) {
    config.logger.info(`${config.operationName} completed successfully`, context || {});
    config.metrics.addMetric(config.successMetric, 'Count', 1);
  } else {
    config.logger.warn(`${config.operationName} completed with failure`, {
      ...(context || {}),
      message: result.message,
    });
  }
  
  return result;
}