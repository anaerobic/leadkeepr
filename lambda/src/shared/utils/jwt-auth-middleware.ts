/**
 * Authentication middleware utilities for Koa applications
 * Provides reusable JWT authentication patterns
 */

import Koa from 'koa';
import { CognitoJwtVerifier } from './cognito-jwt';

/**
 * User information extracted from JWT token
 */
export interface AuthenticatedUser {
  email: string;
  username: string;
  payload: Record<string, unknown>;
}

/**
 * Extended Koa context with authenticated user
 */
export interface AuthenticatedContext extends Koa.DefaultContext {
  state: {
    user: AuthenticatedUser;
    [key: string]: unknown;
  };
}

/**
 * Create JWT authentication middleware
 */
export function createJwtAuthMiddleware(cognitoJwtVerifier: CognitoJwtVerifier) {
  return async (ctx: Koa.DefaultContext, next: Koa.Next): Promise<void> => {
    const authHeader = ctx.get('Authorization');

    if (!authHeader) {
      ctx.status = 401;
      ctx.body = { success: false, message: 'Authorization token required' };
      return;
    }

    const decoded = cognitoJwtVerifier.extractUserFromAuthHeader(authHeader);

    if (!decoded || !decoded.isValid) {
      ctx.status = 401;
      ctx.body = { success: false, message: 'Invalid or expired token' };
      return;
    }

    // Add user info to context for downstream use
    ctx.state.user = {
      email: decoded.email,
      username: decoded.username,
      payload: decoded.payload,
    };

    await next();
  };
}

/**
 * Helper function to get authenticated user from context
 * Provides type safety for accessing user data in routes
 */
export function getAuthenticatedUser(ctx: Koa.DefaultContext): AuthenticatedUser {
  return (ctx as AuthenticatedContext).state.user;
}
