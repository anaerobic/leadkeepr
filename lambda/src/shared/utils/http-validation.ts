/**
 * HTTP request validation utilities for Koa routes
 * Provides common validation patterns for request body and parameters
 */

import Koa from 'koa';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  message: string;
}

/**
 * Validation result for request data
 */
export interface RequestValidationResult {
  isValid: boolean;
  message?: string;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(message: string): ErrorResponse {
  return {
    success: false,
    message,
  };
}

/**
 * Validate request body contains required string fields
 */
export function validateRequiredStringFields(
  body: unknown,
  fields: string[]
): RequestValidationResult {
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      message: 'Invalid request body',
    };
  }

  const bodyObj = body as Record<string, unknown>;

  for (const field of fields) {
    if (typeof bodyObj[field] !== 'string') {
      return {
        isValid: false,
        message: `Invalid request. ${field} is required and must be a string.`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Middleware to validate required fields in request body
 */
export function createBodyValidationMiddleware(requiredFields: string[]) {
  return async (ctx: Koa.DefaultContext, next: Koa.Next): Promise<void> => {
    const validation = validateRequiredStringFields(ctx.request.body, requiredFields);

    if (!validation.isValid) {
      ctx.status = 400;
      ctx.body = createErrorResponse(validation.message!);
      return;
    }

    await next();
  };
}

/**
 * Set success response with optional data
 */
export function setSuccessResponse(ctx: Koa.DefaultContext, data?: unknown, status = 200): void {
  ctx.status = status;
  ctx.body = data ? { success: true, ...data } : { success: true };
}

/**
 * Set error response with message and status
 */
export function setErrorResponse(ctx: Koa.DefaultContext, message: string, status = 400): void {
  ctx.status = status;
  ctx.body = createErrorResponse(message);
}

/**
 * Middleware to handle service response patterns
 * Automatically sets status and body based on service result
 */
export function createServiceResponseHandler(successStatus = 200, errorStatus = 400) {
  return (result: { success: boolean; message?: string; [key: string]: unknown }) => {
    if (result.success) {
      return {
        status: successStatus,
        body: result,
      };
    } else {
      return {
        status: errorStatus,
        body: result,
      };
    }
  };
}
