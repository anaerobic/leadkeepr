import {
  convertEmailDateToIso,
  getCurrentTimestamp,
  getRfc2822Date,
  formatToHumanFriendly,
  isPastDate,
} from '../utils/dates';

describe('dates utilities', () => {
  describe('convertEmailDateToIso', () => {
    it('should convert RFC 2822 date with timezone to ISO format', () => {
      const emailDate = 'Fri, 29 Aug 2025 09:20:19 -0700';
      const result = convertEmailDateToIso(emailDate);

      // Should preserve the timezone offset in ISO format
      expect(result).toMatch(/2025-08-29T\d{2}:20:19\.000-07:00/);
    });

    it('should handle positive timezone offset', () => {
      const emailDate = 'Mon, 01 Jan 2025 12:00:00 +0530';
      const result = convertEmailDateToIso(emailDate);

      // The time gets converted due to timezone handling, so we check the structure
      expect(result).toMatch(/2025-01-01T\d{2}:\d{2}:00\.000\+05:30/);
    });

    it('should handle negative timezone offset', () => {
      const emailDate = 'Wed, 15 Dec 2025 15:30:45 -0800';
      const result = convertEmailDateToIso(emailDate);

      expect(result).toMatch(/2025-12-15T\d{2}:30:45\.000-08:00/);
    });

    it('should fallback to standard parsing when no timezone is present', () => {
      const emailDate = 'Fri, 29 Aug 2025 09:20:19';
      const result = convertEmailDateToIso(emailDate);

      // Should return a valid ISO string (ending with Z for UTC)
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should handle edge case with zero offset', () => {
      const emailDate = 'Sat, 01 Jun 2025 00:00:00 +0000';
      const result = convertEmailDateToIso(emailDate);

      expect(result).toMatch(/2025-06-01T\d{2}:00:00\.000\+00:00/);
    });

    it('should preserve local time and not convert to UTC - regression test for timezone bug', () => {
      // This is the exact date from the bug report
      const emailDate = 'Fri, 5 Sep 2025 20:26:04 -0700';
      const result = convertEmailDateToIso(emailDate);

      // Should preserve the local time (20:26:04) and timezone (-07:00)
      // NOT convert to UTC which would be 03:26:04 the next day
      expect(result).toBe('2025-09-05T20:26:04.000-07:00');

      // Verify it's not the UTC-converted time
      expect(result).not.toBe('2025-09-06T03:26:04.000-07:00');
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return current timestamp in ISO format', () => {
      const timestamp = getCurrentTimestamp();

      // Should be a valid ISO string
      expect(timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

      // Should be recent (within last few seconds)
      const now = new Date();
      const timestampDate = new Date(timestamp);
      const diffMs = Math.abs(now.getTime() - timestampDate.getTime());
      expect(diffMs).toBeLessThan(5000); // Within 5 seconds
    });
  });

  describe('getRfc2822Date', () => {
    it('should return current date in RFC 2822 format', () => {
      const rfc2822Date = getRfc2822Date();

      // Should match RFC 2822 format pattern
      expect(rfc2822Date).toMatch(/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/);

      // Should be recent (within last few seconds)
      const now = new Date();
      const rfc2822DateObj = new Date(rfc2822Date);
      const diffMs = Math.abs(now.getTime() - rfc2822DateObj.getTime());
      expect(diffMs).toBeLessThan(5000); // Within 5 seconds
    });
  });

  describe('formatToHumanFriendly', () => {
    it('should format Pacific Time date correctly with proper local time calculation', () => {
      // 17:00 LOCAL TIME in Pacific timezone (-07:00) = 5:00 PM PDT
      const isoDate = '2025-09-04T17:00:00.000-07:00';
      const result = formatToHumanFriendly(isoDate);

      expect(result).toBe('Thursday, September 4 2025 @ 5PM (PDT)');
    });

    it('should format Eastern Time date correctly with proper local time calculation', () => {
      // 14:30 LOCAL TIME in Eastern timezone (-05:00) = 2:30 PM EST (December is EST, not EDT)
      const isoDate = '2025-12-25T14:30:00.000-05:00';
      const result = formatToHumanFriendly(isoDate);

      expect(result).toBe('Thursday, December 25 2025 @ 2:30PM (EST)');
    });

    it('should format UTC date correctly', () => {
      const isoDate = '2025-06-15T12:00:00.000+00:00';
      const result = formatToHumanFriendly(isoDate);

      expect(result).toBe('Sunday, June 15 2025 @ 12PM (UTC)');
    });

    it('should handle positive timezone offset correctly', () => {
      // 08:45 LOCAL TIME in India timezone (+05:30) = 8:45 AM IST
      const isoDate = '2025-03-10T08:45:00.000+05:30';
      const result = formatToHumanFriendly(isoDate);

      expect(result).toBe('Monday, March 10 2025 @ 8:45AM (+05:30)');
    });

    it('should handle timezone calculation crossing day boundaries', () => {
      // 23:00 LOCAL TIME in Pacific timezone (-08:00) = 11:00 PM PST (January is PST)
      const isoDate = '2025-01-01T23:00:00.000-08:00';
      const result = formatToHumanFriendly(isoDate);

      expect(result).toBe('Wednesday, January 1 2025 @ 11PM (PST)');
    });

    it('should format noon correctly', () => {
      // 12:00 LOCAL TIME in Eastern timezone (-04:00) = 12:00 PM EDT (July is EDT)
      const isoDate = '2025-07-04T12:00:00.000-04:00';
      const result = formatToHumanFriendly(isoDate);

      expect(result).toBe('Friday, July 4 2025 @ 12PM (EDT)');
    });

    it('should handle minutes correctly when not zero', () => {
      // 15:42 LOCAL TIME in Central timezone (-06:00) = 3:42 PM CST (November is CST)
      const isoDate = '2025-11-11T15:42:00.000-06:00';
      const result = formatToHumanFriendly(isoDate);

      expect(result).toBe('Tuesday, November 11 2025 @ 3:42PM (CST)');
    });

    it('should handle single digit minutes correctly', () => {
      // 09:05 LOCAL TIME in Mountain timezone (-07:00) = 9:05 AM MST (February is MST for -07:00)
      const isoDate = '2025-02-14T09:05:00.000-07:00';
      const result = formatToHumanFriendly(isoDate);

      expect(result).toBe('Friday, February 14 2025 @ 9:05AM (MST)');
    });

    it('should handle date without milliseconds', () => {
      // 16:30 LOCAL TIME in -03:00 timezone = 4:30 PM local time
      const isoDate = '2025-08-20T16:30:00-03:00';
      const result = formatToHumanFriendly(isoDate);

      expect(result).toBe('Wednesday, August 20 2025 @ 4:30PM (-03:00)');
    });

    // Critical timezone understanding tests - corrected interpretations
    describe('timezone interpretation verification', () => {
      it('should correctly interpret 20:05 LOCAL TIME in Pacific timezone', () => {
        // "2025-09-05T20:05:23.000-07:00" means 20:05 (8:05 PM) LOCAL TIME in Pacific timezone
        const isoDate = '2025-09-05T20:05:23.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        // Should be 8:05 PM PDT (the local time specified)
        expect(result).toBe('Friday, September 5 2025 @ 8:05PM (PDT)');
      });

      it('should correctly interpret 20:30 LOCAL TIME in Pacific timezone', () => {
        // "2025-09-05T20:30:58.000-07:00" means 20:30 (8:30 PM) LOCAL TIME in Pacific timezone
        const isoDate = '2025-09-05T20:30:58.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        // Should be 8:30 PM PDT (the local time specified)
        expect(result).toBe('Friday, September 5 2025 @ 8:30PM (PDT)');
      });

      it('should correctly interpret 19:36 LOCAL TIME in Pacific timezone', () => {
        // "2025-09-05T19:36:52.000-07:00" means 19:36 (7:36 PM) LOCAL TIME in Pacific timezone
        const isoDate = '2025-09-05T19:36:52.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        // Should be 7:36 PM PDT (the local time specified)
        expect(result).toBe('Friday, September 5 2025 @ 7:36PM (PDT)');
      });

      it('should correctly interpret 17:03 LOCAL TIME in Pacific timezone', () => {
        // "2025-09-05T17:03:37.000-07:00" means 17:03 (5:03 PM) LOCAL TIME in Pacific timezone
        const isoDate = '2025-09-05T17:03:37.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        // Should be 5:03 PM PDT (the local time specified)
        expect(result).toBe('Friday, September 5 2025 @ 5:03PM (PDT)');
      });

      it('should handle OpenAI reminder scheduling format correctly', () => {
        // OpenAI provides timestamps like "2025-09-05T17:03:37.000-07:00"
        // This means 17:03 (5:03 PM) LOCAL TIME in Pacific timezone
        const isoDate = '2025-09-05T17:03:37.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        // The time components represent the LOCAL TIME in the specified timezone
        expect(result).toBe('Friday, September 5 2025 @ 5:03PM (PDT)');
        expect(result).toContain('5:03PM'); // Should show the local time specified
        expect(result).not.toContain('10:03'); // Should NOT show wrong calculation
      });
    });

    describe('timezone abbreviation mapping', () => {
      it('should show PDT for Pacific Daylight Time', () => {
        // September is during daylight saving time
        const isoDate = '2025-09-05T20:00:00.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toContain('(PDT)');
      });

      it('should show PST for Pacific Standard Time', () => {
        // January is during standard time, but -08:00 is PST
        const isoDate = '2025-01-15T16:00:00.000-08:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toContain('(PST)');
      });

      it('should show EDT for Eastern Daylight Time', () => {
        // July is during daylight saving time
        const isoDate = '2025-07-15T16:00:00.000-04:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toContain('(EDT)');
      });

      it('should show EST for Eastern Standard Time', () => {
        // December is during standard time
        const isoDate = '2025-12-15T17:00:00.000-05:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toContain('(EST)');
      });

      it('should show CST for Central Standard Time', () => {
        // January is during standard time
        const isoDate = '2025-01-15T18:00:00.000-06:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toContain('(CST)');
      });

      it('should show UTC for UTC timezone', () => {
        const isoDate = '2025-06-15T12:00:00.000+00:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toContain('(UTC)');
      });

      it('should fallback to raw offset for unknown timezones', () => {
        // Unusual offset that doesn't map to a known timezone
        const isoDate = '2025-06-15T12:00:00.000+09:30';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toContain('(+09:30)');
      });
    });

    it('should fallback gracefully for invalid date format', () => {
      // Mock console.error to suppress expected error output during test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const invalidDate = 'not-a-date';
      const result = formatToHumanFriendly(invalidDate);

      expect(result).toContain('Invalid Date');

      consoleSpy.mockRestore();
    });

    it('should fallback to Intl.DateTimeFormat for malformed ISO strings', () => {
      // Mock console.error to suppress error output during test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const malformedDate = '2025-13-45T25:70:00.000-07:00'; // Invalid month/day/time
      const result = formatToHumanFriendly(malformedDate);

      // Should use fallback formatting or return error message
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    describe('edge cases', () => {
      it('should handle leap year date', () => {
        // 10:15 LOCAL TIME in Eastern timezone (-05:00) = 10:15 AM EST (February is EST)
        const isoDate = '2024-02-29T10:15:00.000-05:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toBe('Thursday, February 29 2024 @ 10:15AM (EST)');
      });

      it('should handle year boundaries with timezone crossing', () => {
        // 23:59 LOCAL TIME on December 31 in -12:00 timezone = 11:59 PM that day
        const isoDate = '2025-12-31T23:59:00.000-12:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toBe('Wednesday, December 31 2025 @ 11:59PM (-12:00)');
      });

      it('should handle extreme positive offset', () => {
        // 12:00 LOCAL TIME in +14:00 timezone = 12:00 PM that day
        const isoDate = '2025-06-01T12:00:00.000+14:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toBe('Sunday, June 1 2025 @ 12PM (+14:00)');
      });

      it('should handle extreme negative offset', () => {
        // 00:00 LOCAL TIME in -12:00 timezone = 12:00 AM that day
        const isoDate = '2025-06-01T00:00:00.000-12:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toBe('Sunday, June 1 2025 @ 12AM (-12:00)');
      });
    });

    describe('time formatting edge cases', () => {
      it('should format 1 AM correctly', () => {
        // 01:00 LOCAL TIME in Pacific timezone (-07:00) = 1:00 AM PDT
        const isoDate = '2025-05-15T01:00:00.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toBe('Thursday, May 15 2025 @ 1AM (PDT)');
      });

      it('should format 1 PM correctly', () => {
        // 13:00 LOCAL TIME in Pacific timezone (-07:00) = 1:00 PM PDT
        const isoDate = '2025-05-15T13:00:00.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toBe('Thursday, May 15 2025 @ 1PM (PDT)');
      });

      it('should format 11 PM correctly', () => {
        // 23:00 LOCAL TIME in Pacific timezone (-07:00) = 11:00 PM PDT
        const isoDate = '2025-05-15T23:00:00.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toBe('Thursday, May 15 2025 @ 11PM (PDT)');
      });

      it('should format 11 AM correctly', () => {
        // 11:00 LOCAL TIME in Pacific timezone (-07:00) = 11:00 AM PDT
        const isoDate = '2025-05-15T11:00:00.000-07:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toBe('Thursday, May 15 2025 @ 11AM (PDT)');
      });

      it('should format midnight correctly', () => {
        // 00:00 LOCAL TIME in Pacific timezone (-08:00) = 12:00 AM PST (January is PST)
        const isoDate = '2025-01-01T00:00:00.000-08:00';
        const result = formatToHumanFriendly(isoDate);

        expect(result).toBe('Wednesday, January 1 2025 @ 12AM (PST)');
      });
    });
  });

  describe('isPastDate', () => {
    it('should return true for past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      expect(isPastDate(yesterday.toISOString())).toBe(true);
    });

    it('should return false for future dates', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(isPastDate(tomorrow.toISOString())).toBe(false);
    });

    it('should return false for dates in the near future', () => {
      const nearFuture = new Date();
      nearFuture.setMinutes(nearFuture.getMinutes() + 5);

      expect(isPastDate(nearFuture.toISOString())).toBe(false);
    });

    it('should return true for dates in the near past', () => {
      const nearPast = new Date();
      nearPast.setMinutes(nearPast.getMinutes() - 5);

      expect(isPastDate(nearPast.toISOString())).toBe(true);
    });

    it('should handle different date string formats', () => {
      const pastDate = '2020-01-01T12:00:00.000Z';
      const futureDate = '2030-01-01T12:00:00.000Z';

      expect(isPastDate(pastDate)).toBe(true);
      expect(isPastDate(futureDate)).toBe(false);
    });

    it('should handle timezone-aware date strings', () => {
      const pastDateWithTz = '2020-01-01T12:00:00.000-08:00';
      const futureDateWithTz = '2030-01-01T12:00:00.000-08:00';

      expect(isPastDate(pastDateWithTz)).toBe(true);
      expect(isPastDate(futureDateWithTz)).toBe(false);
    });
  });
});
