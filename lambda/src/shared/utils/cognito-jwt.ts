/**
 * JWT verification utilities for Cognito tokens
 */

import { Logger } from '@aws-lambda-powertools/logger';

export interface CognitoJwtPayload {
  sub: string; // User ID
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
  'custom:timezone'?: string;
  aud: string; // Client ID
  event_id: string;
  token_use: 'id' | 'access';
  auth_time: number;
  iat: number;
  exp: number;
  iss: string; // Issuer URL
}

export interface VerifiedToken {
  payload: CognitoJwtPayload;
  isValid: boolean;
  username: string;
  email: string;
}

/**
 * Simple JWT token decoder (no signature verification)
 *
 * Note: This is a basic implementation for extracting claims.
 * In production, you should use a proper JWT library with signature verification
 * against Cognito's JWKS endpoint.
 */
export class CognitoJwtVerifier {
  constructor(
    private readonly userPoolId: string,
    private readonly clientId: string,
    private readonly region: string,
    private readonly logger: Logger
  ) {}

  /**
   * Decode and validate Cognito JWT token (basic validation only)
   */
  decodeToken(token: string): VerifiedToken {
    try {
      // Remove 'Bearer ' prefix if present
      const cleanToken = token.replace(/^Bearer\s+/, '');

      // Split JWT into parts
      const parts = cleanToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      // Decode payload (base64url)
      const payload = this.base64UrlDecode(parts[1]);
      const claims = JSON.parse(payload) as CognitoJwtPayload;

      // Basic validation
      const now = Math.floor(Date.now() / 1000);
      const isExpired = claims.exp < now;
      const isValidIssuer =
        claims.iss === `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;
      const isValidAudience = claims.aud === this.clientId;

      const isValid = !isExpired && isValidIssuer && isValidAudience;

      if (!isValid) {
        this.logger.warn('JWT token validation failed', {
          expired: isExpired,
          validIssuer: isValidIssuer,
          validAudience: isValidAudience,
          exp: claims.exp,
          now,
          iss: claims.iss,
          aud: claims.aud,
        });
      }

      return {
        payload: claims,
        isValid,
        username: claims.sub,
        email: claims.email,
      };
    } catch (error) {
      this.logger.error('Failed to decode JWT token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        payload: {} as CognitoJwtPayload,
        isValid: false,
        username: '',
        email: '',
      };
    }
  }

  /**
   * Extract user information from Authorization header
   */
  extractUserFromAuthHeader(authHeader?: string): VerifiedToken | null {
    if (!authHeader) {
      return null;
    }

    // Check for Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      this.logger.warn('Authorization header does not contain Bearer token');
      return null;
    }

    return this.decodeToken(authHeader);
  }

  /**
   * Validate that a token belongs to the expected user
   */
  validateTokenForUser(token: string, expectedEmail: string): boolean {
    const decoded = this.decodeToken(token);

    if (!decoded.isValid) {
      return false;
    }

    return decoded.email.toLowerCase() === expectedEmail.toLowerCase();
  }

  /**
   * Base64URL decode utility
   */
  private base64UrlDecode(str: string): string {
    // Add padding if needed
    let padded = str;
    const pad = 4 - (str.length % 4);
    if (pad !== 4) {
      padded += '='.repeat(pad);
    }

    // Replace URL-safe characters
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');

    // Decode
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}

/**
 * Factory function to create CognitoJwtVerifier
 */
export function createCognitoJwtVerifier(
  userPoolId: string,
  clientId: string,
  region: string,
  logger: Logger
): CognitoJwtVerifier {
  return new CognitoJwtVerifier(userPoolId, clientId, region, logger);
}
