import {
  createValidationSuccess,
  createValidationError,
  createValidationErrors,
  validateRequired,
  validateEmailFormat,
  validateEnum,
  validateContains,
  collectValidationErrors,
  createValidator,
} from '../utils/validation';

describe('Validation Utils', () => {
  describe('ValidationResult types', () => {
    it('should create successful validation result', () => {
      const result = createValidationSuccess({ id: '123' });

      expect(result.isValid).toBe(true);
      expect(result.data).toEqual({ id: '123' });
      expect(result.errors).toEqual([]);
    });

    it('should create validation error with single message', () => {
      const result = createValidationError('Field is required');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Field is required');
      expect(result.errors).toEqual(['Field is required']);
    });

    it('should create validation errors with multiple messages', () => {
      const result = createValidationErrors(['Error 1', 'Error 2']);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(['Error 1', 'Error 2']);
    });
  });

  describe('validateRequired', () => {
    it('should return null for valid values', () => {
      expect(validateRequired('test', 'Field')).toBeNull();
      expect(validateRequired(123, 'Field')).toBeNull();
      expect(validateRequired({}, 'Field')).toBeNull();
      expect(validateRequired([], 'Field')).toBeNull();
    });

    it('should return error for invalid values', () => {
      expect(validateRequired(null, 'Field')).toBe('Field is required');
      expect(validateRequired(undefined, 'Field')).toBe('Field is required');
      expect(validateRequired('', 'Field')).toBe('Field is required');
    });
  });

  describe('validateEmailFormat', () => {
    it('should return null for valid emails', () => {
      expect(validateEmailFormat('test@example.com')).toBeNull();
      expect(validateEmailFormat('user.name@domain.co.uk')).toBeNull();
      expect(validateEmailFormat('test+tag@example.org')).toBeNull();
    });

    it('should return error for invalid emails', () => {
      expect(validateEmailFormat('invalid')).toBe('Email must be a valid email address');
      expect(validateEmailFormat('test@')).toBe('Email must be a valid email address');
      expect(validateEmailFormat('@domain.com')).toBe('Email must be a valid email address');
      expect(validateEmailFormat('test@domain')).toBe('Email must be a valid email address');
    });

    it('should use custom field name in error message', () => {
      expect(validateEmailFormat('invalid', 'User Email')).toBe(
        'User Email must be a valid email address'
      );
    });

    it('should handle non-string values', () => {
      expect(validateEmailFormat(null as any)).toBe('Email must be a valid string');
      expect(validateEmailFormat(undefined as any)).toBe('Email must be a valid string');
      expect(validateEmailFormat(123 as any)).toBe('Email must be a valid string');
    });
  });

  describe('validateEnum', () => {
    const allowedValues = ['option1', 'option2', 'option3'];

    it('should return null for valid enum values', () => {
      expect(validateEnum('option1', allowedValues, 'Field')).toBeNull();
      expect(validateEnum('option2', allowedValues, 'Field')).toBeNull();
    });

    it('should return error for invalid enum values', () => {
      const result = validateEnum('invalid', allowedValues, 'Field');
      expect(result).toBe('Field must be one of: option1, option2, option3');
    });
  });

  describe('validateContains', () => {
    it('should return null when substring is present', () => {
      expect(validateContains('test@example.com', '@', 'Email')).toBeNull();
    });

    it('should return error when substring is missing', () => {
      expect(validateContains('testexample.com', '@', 'Email')).toBe("Email must contain '@'");
      expect(validateContains('', '@', 'Email')).toBe("Email must contain '@'");
    });
  });

  describe('collectValidationErrors', () => {
    it('should collect only non-null errors', () => {
      const errors = collectValidationErrors('Error 1', null, 'Error 2', null, 'Error 3');

      expect(errors).toEqual(['Error 1', 'Error 2', 'Error 3']);
    });

    it('should return empty array when no errors', () => {
      const errors = collectValidationErrors(null, null, null);
      expect(errors).toEqual([]);
    });
  });

  describe('ValidationBuilder', () => {
    it('should build successful validation with no errors', () => {
      const result = createValidator()
        .required('test', 'Field')
        .email('test@example.com', 'Email')
        .build();

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should collect multiple validation errors', () => {
      const result = createValidator()
        .required('', 'Required Field')
        .email('invalid-email', 'Email Field')
        .enum('invalid', ['option1', 'option2'], 'Enum Field')
        .build();

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual([
        'Required Field is required',
        'Email Field must be a valid email address',
        'Enum Field must be one of: option1, option2',
      ]);
    });

    it('should support prefix validation', () => {
      const result = createValidator().prefix('invalid', 'CONNECTION#', 'Sort Key').build();

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(["Sort Key must start with 'CONNECTION#'"]);
    });

    it('should support contains validation', () => {
      const result = createValidator().contains('testexample.com', '@', 'Email').build();

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(["Email must contain '@'"]);
    });

    it('should support custom validation', () => {
      const result = createValidator()
        .custom(() => 'Custom error message')
        .custom(() => null) // This should not add an error
        .build();

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(['Custom error message']);
    });

    it('should chain validations fluently', () => {
      const result = createValidator()
        .required('test', 'Field')
        .email('test@example.com')
        .enum('option1', ['option1', 'option2'], 'Choice')
        .prefix('CONNECTION#123', 'CONNECTION#', 'Sort Key')
        .contains('test@example.com', '@', 'Email')
        .build();

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('real-world validation scenarios', () => {
    it('should validate integration action request structure', () => {
      const request = {
        user_email: 'user@example.com',
        provider: 'outlook-calendar',
        action_type: 'create_calendar_event',
      };

      const result = createValidator()
        .required(request.user_email, 'User email')
        .email(request.user_email, 'User email')
        .required(request.provider, 'Provider')
        .enum(request.provider, ['outlook-calendar', 'outlook-todos'], 'Provider')
        .required(request.action_type, 'Action type')
        .build();

      expect(result.isValid).toBe(true);
    });

    it('should validate reminder data with custom logic', () => {
      const emailData = {
        message_id: 'test@example.com',
        thread_id: 'thread-123',
      };

      const result = createValidator()
        .required(emailData.message_id, 'Message ID')
        .contains(emailData.message_id, '@', 'Message ID')
        .custom(() => {
          if (!emailData.thread_id) {
            return 'Thread ID is required for reminders';
          }
          return null;
        })
        .build();

      expect(result.isValid).toBe(true);
    });
  });
});
