/**
 * Shared utilities for generating secure tokens and identifiers
 */

import { randomBytes, randomUUID } from 'crypto';

/**
 * Generate a cryptographically secure random token using randomBytes
 * Suitable for security-sensitive operations like password resets
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a UUID v4 identifier
 * Suitable for entity IDs, verification nonces, etc.
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Generate a short random string using Math.random()
 * NOT cryptographically secure - only use for non-security purposes
 * like unique identifiers, boundaries, etc.
 */
export function generateRandomString(length: number = 8): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Generate a timestamp-based unique identifier
 * Includes timestamp and random component for better uniqueness
 */
export function generateTimestampId(prefix?: string): string {
  const timestamp = Date.now();
  const random = generateRandomString(6);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}