/**
 * Shared PowerTools initialization module
 * Provides centralized logger, tracer, and metrics instances for all Lambda functions
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';

interface PowerToolsConfig {
  serviceName?: string;
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  namespace?: string;
}

interface PowerToolsInstances {
  logger: Logger;
  tracer: Tracer;
  metrics: Metrics;
}

/**
 * Initialize PowerTools instances with consistent configuration
 * @param config Configuration options for PowerTools
 * @returns Initialized logger, tracer, and metrics instances
 */
export function initializePowerTools(config: PowerToolsConfig = {}): PowerToolsInstances {
  const serviceName = config.serviceName || process.env.POWERTOOLS_SERVICE_NAME || 'lambda';
  const logLevel =
    config.logLevel ||
    (process.env.POWERTOOLS_LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR') ||
    'INFO';
  const namespace = config.namespace || process.env.POWERTOOLS_METRICS_NAMESPACE || 'lambda';

  // If POWERTOOLS_SERVICE_NAME is set, let Powertools use it automatically
  // Otherwise, pass serviceName explicitly
  const logger = process.env.POWERTOOLS_SERVICE_NAME
    ? new Logger({ logLevel })
    : new Logger({ serviceName, logLevel });

  const tracer = new Tracer({
    serviceName,
  });

  const metrics = new Metrics({
    namespace,
  });

  return {
    logger,
    tracer,
    metrics,
  };
}
