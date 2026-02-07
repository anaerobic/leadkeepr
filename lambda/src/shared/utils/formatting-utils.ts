/**
 * Common formatting utilities
 * Consolidates frequently used formatting patterns across the codebase
 */

import { Logger } from '@aws-lambda-powertools/logger';

/**
 * Extract error message from unknown error type
 * Consolidates the pattern: error instanceof Error ? error.message : String(error)
 */
export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Format date as ISO date string (YYYY-MM-DD)
 * Consolidates the pattern: date.toISOString().split('T')[0]
 */
export function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Normalize whitespace in text
 * Consolidates the pattern: text.replace(/\s+/g, ' ').trim()
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Remove special characters keeping only alphanumeric
 * Consolidates the pattern: text.replace(/[^a-zA-Z0-9]/g, '')
 */
export function removeSpecialChars(text: string): string {
  return text.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Clean email headers by removing line breaks and extra whitespace
 * Consolidates the pattern: header.replace(/\r?\n\s+/g, ' ').trim()
 */
export function cleanEmailHeader(header: string): string {
  return header.replace(/\r?\n\s+/g, ' ').trim();
}

/**
 * Decode URL component with plus sign handling
 * Consolidates the pattern: decodeURIComponent(str.replace(/\+/g, ' '))
 */
export function decodeUrlComponent(str: string): string {
  return decodeURIComponent(str.replace(/\+/g, ' '));
}

/**
 * Generate random alphanumeric string
 * Consolidates the pattern: Math.random().toString(36).slice(2)
 */
export function generateRandomId(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * Convert timezone offset to IANA timezone name
 * Handles conversion from offset format (e.g., "-07:00", "+00:00") to proper IANA names
 * that TZDate can understand
 */
export function convertTimezoneOffsetToIANA(timezoneInput: string): string {
  // If it's already an IANA timezone name, return as-is
  if (timezoneInput && !timezoneInput.match(/^[+-]\d{2}:\d{2}$/)) {
    return timezoneInput;
  }

  // Map common timezone offsets to IANA names
  const offsetToIANA: Record<string, string> = {
    '-08:00': 'America/Los_Angeles', // PST
    '-07:00': 'America/Los_Angeles', // PDT (same zone, different DST)
    '-06:00': 'America/Chicago', // CST/CDT
    '-05:00': 'America/New_York', // EST/EDT
    '-04:00': 'America/New_York', // EDT
    '+00:00': 'UTC', // UTC
    Z: 'UTC', // UTC alternate format
    '+01:00': 'Europe/London', // CET
    '+02:00': 'Europe/Berlin', // CET/CEST
    // Add more mappings as needed
  };

  // Handle the specific case mentioned: -07:00 should be America/Los_Angeles
  if (timezoneInput === '-07:00') {
    return 'America/Los_Angeles';
  }

  // Default to UTC for +00:00 or unknown offsets
  if (timezoneInput === '+00:00' || !timezoneInput) {
    return 'UTC';
  }

  // Look up the offset in our mapping
  return offsetToIANA[timezoneInput] || 'UTC';
}

/**
 * Safely parse a JSON string, returning null if parsing fails
 * Consolidates the pattern of try-catch around JSON.parse()
 * @param jsonString - String to parse as JSON
 * @returns Parsed object or null if parsing fails
 */
export function safeJsonParse<T>(jsonString: string): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('JSON parsing failed', { error: formatErrorMessage(error), jsonString });
    return null;
  }
}

/**
 * Standardized logger for error messages with context
 * Consolidates the pattern of logging errors with details and stack traces
 * @param logger - Logger instance to use
 * @param message - Error message
 * @param context - Context object with error details
 * @param error - Original error object
 */
export function logError(
  logger: Logger,
  message: string,
  context: Record<string, unknown> = {},
  error?: unknown
): void {
  // Create base context with standard fields
  const errorContext = {
    ...context,
  };

  // Add error information if available
  if (error) {
    // Extract useful information from the error
    if (error instanceof Error) {
      errorContext.errorMessage = error.message;
      errorContext.errorName = error.name;
      errorContext.errorStack = error.stack;
    } else {
      errorContext.error = String(error);
    }
  }

  // Log the error with consistent formatting
  logger.error(message, errorContext);
}
