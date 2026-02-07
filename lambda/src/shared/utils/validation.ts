/**
 * Shared validation utilities and patterns
 * Provides common validation result types and helper functions
 */

/**
 * Standard validation result type used across services
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Extended validation result with optional data
 */
interface ValidationResultWithData<T = unknown> {
  isValid: boolean;
  errors?: string[];
  data?: T;
  error?: string;
}

/**
 * Create a successful validation result
 */
export function createValidationSuccess<T = unknown>(data?: T): ValidationResultWithData<T> {
  return {
    isValid: true,
    data,
    errors: [],
  };
}

/**
 * Create a failed validation result with error message
 */
export function createValidationError<T = unknown>(error: string): ValidationResultWithData<T> {
  return {
    isValid: false,
    error,
    errors: [error],
  };
}

/**
 * Create a failed validation result with multiple errors
 */
export function createValidationErrors(errors: string[]): ValidationResult {
  return {
    isValid: false,
    errors,
  };
}

/**
 * Validate that a required field is present and not empty
 */
export function validateRequired(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return `${fieldName} is required`;
  }
  return null;
}

/**
 * Validate email address format using basic regex
 */
export function validateEmailFormat(email: string, fieldName: string = 'Email'): string | null {
  if (!email || typeof email !== 'string') {
    return `${fieldName} must be a valid string`;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return `${fieldName} must be a valid email address`;
  }

  return null;
}

/**
 * Validate that a value is one of the allowed options
 */
export function validateEnum<T extends string>(
  value: string,
  allowedValues: T[],
  fieldName: string
): string | null {
  if (!allowedValues.includes(value as T)) {
    return `${fieldName} must be one of: ${allowedValues.join(', ')}`;
  }
  return null;
}

/**
 * Validate that a string starts with a specific prefix
 */
function validatePrefix(value: string, prefix: string, fieldName: string): string | null {
  if (!value || !value.startsWith(prefix)) {
    return `${fieldName} must start with '${prefix}'`;
  }
  return null;
}

/**
 * Validate that a string contains a specific character/substring
 */
export function validateContains(
  value: string,
  substring: string,
  fieldName: string
): string | null {
  if (!value || !value.includes(substring)) {
    return `${fieldName} must contain '${substring}'`;
  }
  return null;
}

/**
 * Helper function to collect validation errors from multiple validators
 */
export function collectValidationErrors(...errorChecks: (string | null)[]): string[] {
  return errorChecks.filter((error): error is string => error !== null);
}

/**
 * Builder pattern for validation with fluent interface
 */
class ValidationBuilder {
  private errors: string[] = [];

  required(value: unknown, fieldName: string): ValidationBuilder {
    const error = validateRequired(value, fieldName);
    if (error) {
      this.errors.push(error);
    }
    return this;
  }

  email(value: string, fieldName?: string): ValidationBuilder {
    const error = validateEmailFormat(value, fieldName);
    if (error) {
      this.errors.push(error);
    }
    return this;
  }

  enum<T extends string>(value: string, allowedValues: T[], fieldName: string): ValidationBuilder {
    const error = validateEnum(value, allowedValues, fieldName);
    if (error) {
      this.errors.push(error);
    }
    return this;
  }

  prefix(value: string, prefix: string, fieldName: string): ValidationBuilder {
    const error = validatePrefix(value, prefix, fieldName);
    if (error) {
      this.errors.push(error);
    }
    return this;
  }

  contains(value: string, substring: string, fieldName: string): ValidationBuilder {
    const error = validateContains(value, substring, fieldName);
    if (error) {
      this.errors.push(error);
    }
    return this;
  }

  custom(validationFn: () => string | null): ValidationBuilder {
    const error = validationFn();
    if (error) {
      this.errors.push(error);
    }
    return this;
  }

  build(): ValidationResult {
    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
    };
  }
}

/**
 * Create a new validation builder instance
 */
export function createValidator(): ValidationBuilder {
  return new ValidationBuilder();
}
