import { formatDateToICSFormat } from '../dates';

describe('Date Utilities', () => {
  describe('formatDateToICSFormat', () => {
    it('should format Date object to ICS format correctly', () => {
      const testDate = new Date('2025-08-29T14:35:42Z');
      const result = formatDateToICSFormat(testDate);

      // Format should be YYYYMMDDTHHMMSS - the exact value will depend on the timezone of the test environment
      expect(result).toMatch(/^\d{8}T\d{6}$/);
      expect(result.length).toBe(15); // 8 chars for date + 'T' + 6 chars for time
    });

    it('should handle date at the start of the year', () => {
      // Use local time to avoid timezone conversion issues
      const testDate = new Date(2025, 0, 1, 12, 0, 0); // Jan 1, 2025, 12:00 local time
      const result = formatDateToICSFormat(testDate);

      // Check that month and day are zero-padded and it's actually 2025
      expect(result).toMatch(/^20250101T\d{6}$/);
    });

    it('should handle date at the end of the year', () => {
      // Use local time to avoid timezone conversion issues
      const testDate = new Date(2025, 11, 31, 12, 0, 0); // Dec 31, 2025, 12:00 local time
      const result = formatDateToICSFormat(testDate);

      expect(result).toMatch(/^20251231T\d{6}$/);
    });
  });
});
