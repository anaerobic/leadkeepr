/**
 * Shared Koa middleware utilities for web handlers
 * Provides reusable middleware functions with standardized error handling and logging
 */

import Koa from 'koa';
import bodyParser from '@koa/bodyparser';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';

/**
 * Configuration for middleware setup
 */
export interface MiddlewareConfig {
  logger: Logger;
  metrics: Metrics;
  allowedOrigins: string[];
  bodyLimits?: {
    jsonLimit?: string;
    formLimit?: string;
    textLimit?: string;
  };
}

/**
 * Create global error handling middleware
 */
export function createErrorHandlingMiddleware(logger: Logger, metrics: Metrics) {
  return async (ctx: Koa.DefaultContext, next: Koa.Next): Promise<void> => {
    try {
      await next();
    } catch (error) {
      logger.error('Unhandled error in web app', {
        error: error instanceof Error ? error.message : String(error),
        path: ctx.path,
        method: ctx.method,
      });
      metrics.addMetric('WebAppUnhandledError', 'Count', 1);

      ctx.status = 500;
      ctx.body = {
        success: false,
        message: 'An unexpected error occurred. Please try again later.',
      };
    }
  };
}

/**
 * Create CORS middleware with configurable origins
 */
export function createCorsMiddleware(allowedOrigins: string[]) {
  return async (ctx: Koa.DefaultContext, next: Koa.Next): Promise<void> => {
    const origin = ctx.get('Origin');
    if (allowedOrigins.includes(origin)) {
      ctx.set('Access-Control-Allow-Origin', origin);
      ctx.set('Access-Control-Allow-Credentials', 'true');
      ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    }

    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      return;
    }

    await next();
  };
}

/**
 * Create request logging middleware with duration tracking
 */
export function createRequestLoggingMiddleware(logger: Logger, metrics: Metrics) {
  return async (ctx: Koa.DefaultContext, next: Koa.Next): Promise<void> => {
    const start = Date.now();
    logger.info('Request received', {
      method: ctx.method,
      path: ctx.path,
      userAgent: ctx.get('User-Agent'),
    });

    await next();

    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: ctx.method,
      path: ctx.path,
      status: ctx.status,
      duration,
    });
    metrics.addMetric('WebAppRequestDuration', 'Milliseconds', duration);
  };
}

/**
 * Setup standard middleware stack for Koa applications
 */
export function setupStandardMiddleware(app: Koa, config: MiddlewareConfig): void {
  const { logger, metrics, allowedOrigins, bodyLimits } = config;

  // Global error handling middleware (first)
  app.use(createErrorHandlingMiddleware(logger, metrics));

  // CORS middleware
  app.use(createCorsMiddleware(allowedOrigins));

  // Request logging middleware
  app.use(createRequestLoggingMiddleware(logger, metrics));

  // Body parser middleware with configurable limits
  app.use(
    bodyParser({
      jsonLimit: bodyLimits?.jsonLimit || '1mb',
      formLimit: bodyLimits?.formLimit || '1mb',
      textLimit: bodyLimits?.textLimit || '1mb',
      encoding: 'utf8',
    })
  );
}
