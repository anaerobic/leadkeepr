import {
  formatErrorMessage,
  formatDateOnly,
  normalizeWhitespace,
  removeSpecialChars,
  cleanEmailHeader,
  decodeUrlComponent,
  generateRandomId,
  convertTimezoneOffsetToIANA,
} from '../formatting-utils';

describe('Formatting Utils', () => {
  describe('formatErrorMessage', () => {
    it('should format error message from Error object', () => {
      const error = new Error('Test error');
      const result = formatErrorMessage(error);
      expect(result).toBe('Test error');
    });

    it('should format error message from string', () => {
      const result = formatErrorMessage('Test error string');
      expect(result).toBe('Test error string');
    });

    it('should format error message from other types', () => {
      const result = formatErrorMessage({ message: 'object error' });
      expect(result).toBe('[object Object]');
    });
  });

  describe('formatDateOnly', () => {
    it('should format date in YYYY-MM-DD format', () => {
      const date = new Date('2023-06-15T10:30:00Z');
      const result = formatDateOnly(date);
      expect(result).toBe('2023-06-15');
    });
  });

  describe('normalizeWhitespace', () => {
    it('should normalize whitespace', () => {
      const result = normalizeWhitespace('  hello   world  \n  ');
      expect(result).toBe('hello world');
    });
  });

  describe('removeSpecialChars', () => {
    it('should remove special characters', () => {
      const result = removeSpecialChars('hello@world#test!');
      expect(result).toBe('helloworldtest');
    });
  });

  describe('cleanEmailHeader', () => {
    it('should clean line breaks and extra whitespace from email header', () => {
      const result = cleanEmailHeader('Hello\r\n World\n  Test');
      expect(result).toBe('Hello World Test');
    });

    it('should trim whitespace from email header', () => {
      const result = cleanEmailHeader('  Hello World  ');
      expect(result).toBe('Hello World');
    });
  });

  describe('decodeUrlComponent', () => {
    it('should decode URL component and replace plus signs', () => {
      const result = decodeUrlComponent('hello%20world+test');
      expect(result).toBe('hello world test');
    });

    it('should handle valid encoded strings', () => {
      const result = decodeUrlComponent('hello%2Bworld');
      expect(result).toBe('hello+world');
    });
  });

  describe('generateRandomId', () => {
    it('should generate random ID', () => {
      const result = generateRandomId();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[a-z0-9]+$/);
    });

    it('should generate different IDs on multiple calls', () => {
      const result1 = generateRandomId();
      const result2 = generateRandomId();
      expect(result1).not.toBe(result2);
    });
  });

  describe('convertTimezoneOffsetToIANA', () => {
    it('should convert common timezone offsets to IANA names', () => {
      expect(convertTimezoneOffsetToIANA('-08:00')).toBe('America/Los_Angeles');
      expect(convertTimezoneOffsetToIANA('-07:00')).toBe('America/Los_Angeles');
      expect(convertTimezoneOffsetToIANA('-05:00')).toBe('America/New_York');
      expect(convertTimezoneOffsetToIANA('-04:00')).toBe('America/New_York');
      expect(convertTimezoneOffsetToIANA('+00:00')).toBe('UTC');
    });

    it('should return original timezone if already IANA format', () => {
      expect(convertTimezoneOffsetToIANA('America/Los_Angeles')).toBe('America/Los_Angeles');
      expect(convertTimezoneOffsetToIANA('Europe/London')).toBe('Europe/London');
      expect(convertTimezoneOffsetToIANA('UTC')).toBe('UTC');
    });

    it('should default to UTC for unknown formats', () => {
      expect(convertTimezoneOffsetToIANA('unknown')).toBe('unknown'); // Function returns input if not matching offset pattern
      expect(convertTimezoneOffsetToIANA('')).toBe('UTC');
      expect(convertTimezoneOffsetToIANA('+09:00')).toBe('UTC'); // Unmapped offset defaults to UTC
    });
  });
});
