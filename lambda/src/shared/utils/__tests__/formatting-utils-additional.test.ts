import { safeJsonParse, logError } from '../formatting-utils';
import { createMockLogger } from '../../test-utils/powertools-mocks';

describe('Formatting Utilities - Additional Tests', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON string', () => {
      const jsonString = '{"name":"test","value":42}';
      const result = safeJsonParse(jsonString);
      expect(result).toEqual({ name: 'test', value: 42 });
    });

    it('should return null for invalid JSON', () => {
      const invalidJson = '{name:"test",value:42}';
      const result = safeJsonParse(invalidJson);
      expect(result).toBeNull();
    });

    it('should return null for non-JSON strings', () => {
      const nonJson = 'just a string';
      const result = safeJsonParse(nonJson);
      expect(result).toBeNull();
    });
  });

  describe('logError', () => {
    it('should log error with standard format', () => {
      // Create mock logger using powertools mock
      const mockLogger = createMockLogger();

      // Test with Error object
      const testError = new Error('Test error');
      logError(mockLogger, 'Operation failed', { operationId: '123' }, testError);

      // Check logger was called correctly
      expect(mockLogger.error).toHaveBeenCalledWith('Operation failed', {
        operationId: '123',
        errorMessage: 'Test error',
        errorName: 'Error',
        errorStack: expect.any(String),
      });
    });

    it('should handle non-Error objects', () => {
      const mockLogger = createMockLogger();

      // Test with string error
      logError(mockLogger, 'Operation failed', { operationId: '123' }, 'String error');

      expect(mockLogger.error).toHaveBeenCalledWith('Operation failed', {
        operationId: '123',
        error: 'String error',
      });
    });

    it('should work without error object', () => {
      const mockLogger = createMockLogger();

      logError(mockLogger, 'Operation failed', { operationId: '123' });

      expect(mockLogger.error).toHaveBeenCalledWith('Operation failed', {
        operationId: '123',
      });
    });
  });
});
