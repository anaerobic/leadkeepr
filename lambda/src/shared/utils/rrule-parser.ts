import { Logger } from '@aws-lambda-powertools/logger';

/**
 * RFC 5545 RRULE parser for calculating next reminder occurrences
 *
 * Supports basic RRULE patterns commonly used in email reminders:
 * - FREQ=DAILY;INTERVAL=n
 * - FREQ=WEEKLY;INTERVAL=n;BYDAY=MO,TU,WE,TH,FR,SA,SU
 * - FREQ=MONTHLY;INTERVAL=n
 * - FREQ=YEARLY;INTERVAL=n
 *
 * This is a simplified parser focused on the most common use cases.
 * For more complex patterns, we could integrate a full RRULE library later.
 */

interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: string[]; // For weekly: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
  count?: number; // Number of occurrences (not commonly used for reminders)
  until?: Date; // End date (not commonly used for reminders)
}

export class RRuleParser {
  constructor(private readonly logger?: Logger) {}

  /**
   * Parse an RFC 5545 RRULE string into structured data
   * Example: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE" -> { freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'] }
   */
  parseRRule(rrule: string): ParsedRRule | null {
    try {
      // Remove "RRULE:" prefix if present
      const cleanRule = rrule.replace(/^RRULE:/, '');

      // Split into key=value pairs
      const parts = cleanRule.split(';');
      const parsed: Partial<ParsedRRule> = {};

      for (const part of parts) {
        const [key, value] = part.split('=');

        switch (key.toUpperCase()) {
          case 'FREQ':
            if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(value.toUpperCase())) {
              parsed.freq = value.toUpperCase() as ParsedRRule['freq'];
            }
            break;

          case 'INTERVAL': {
            const interval = parseInt(value, 10);
            if (!isNaN(interval) && interval > 0) {
              parsed.interval = interval;
            }
            break;
          }

          case 'BYDAY':
            // Parse day abbreviations: MO,TU,WE -> ['MO', 'TU', 'WE']
            parsed.byDay = value.split(',').map((day) => day.trim().toUpperCase());
            break;

          case 'COUNT': {
            const count = parseInt(value, 10);
            if (!isNaN(count) && count > 0) {
              parsed.count = count;
            }
            break;
          }

          case 'UNTIL':
            // Parse UNTIL date (format: YYYYMMDDTHHMMSSZ)
            try {
              const until = this.parseUntilDate(value);
              if (until) {
                parsed.until = until;
              }
            } catch {
              // Ignore invalid UNTIL dates
            }
            break;
        }
      }

      // Validate required fields
      if (!parsed.freq) {
        this.logger?.warn('RRULE missing required FREQ', { rrule });
        return null;
      }

      // Set default interval if not specified
      if (!parsed.interval) {
        parsed.interval = 1;
      }

      return parsed as ParsedRRule;
    } catch (error) {
      this.logger?.error('Failed to parse RRULE', {
        rrule,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Calculate the next occurrence date based on RRULE and current scheduled time
   */
  calculateNextOccurrence(rrule: string, currentScheduledTime: string): Date | null {
    const parsed = this.parseRRule(rrule);
    if (!parsed) {
      return null;
    }

    const currentDate = new Date(currentScheduledTime);
    if (isNaN(currentDate.getTime())) {
      this.logger?.error('Invalid current scheduled time', { currentScheduledTime });
      return null;
    }

    try {
      switch (parsed.freq) {
        case 'DAILY':
          return this.calculateDailyNext(currentDate, parsed.interval);

        case 'WEEKLY':
          return this.calculateWeeklyNext(currentDate, parsed.interval, parsed.byDay);

        case 'MONTHLY':
          return this.calculateMonthlyNext(currentDate, parsed.interval);

        case 'YEARLY':
          return this.calculateYearlyNext(currentDate, parsed.interval);

        default:
          this.logger?.warn('Unsupported RRULE frequency', { freq: parsed.freq });
          return null;
      }
    } catch (error) {
      this.logger?.error('Failed to calculate next occurrence', {
        rrule,
        currentScheduledTime,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Calculate next daily occurrence
   */
  private calculateDailyNext(currentDate: Date, interval: number): Date {
    const nextDate = new Date(currentDate);
    nextDate.setDate(currentDate.getDate() + interval);
    return nextDate;
  }

  /**
   * Calculate next weekly occurrence
   * If byDay is specified, find the next occurrence on those days
   * Otherwise, just add interval weeks
   */
  private calculateWeeklyNext(currentDate: Date, interval: number, byDay?: string[]): Date {
    if (!byDay || byDay.length === 0) {
      // Simple weekly interval
      const nextDate = new Date(currentDate);
      nextDate.setDate(currentDate.getDate() + interval * 7);
      return nextDate;
    }

    // Convert day abbreviations to day numbers (0 = Sunday, 1 = Monday, etc.)
    const dayMapping: Record<string, number> = {
      SU: 0,
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6,
    };

    const targetDays = byDay
      .map((day) => dayMapping[day])
      .filter((day) => day !== undefined)
      .sort();
    if (targetDays.length === 0) {
      // Fallback to simple weekly if no valid days
      return this.calculateDailyNext(currentDate, interval * 7);
    }

    const currentDayOfWeek = currentDate.getDay();
    const nextDate = new Date(currentDate);

    // Find the next target day in the current week
    const nextDayInWeek = targetDays.find((day) => day > currentDayOfWeek);

    if (nextDayInWeek !== undefined) {
      // Next occurrence is later this week
      nextDate.setDate(currentDate.getDate() + (nextDayInWeek - currentDayOfWeek));
    } else {
      // Next occurrence is in a future week
      const daysUntilNextWeek = 7 - currentDayOfWeek + targetDays[0];
      const weeksToAdd = interval - 1; // We're already going to next occurrence week
      nextDate.setDate(currentDate.getDate() + daysUntilNextWeek + weeksToAdd * 7);
    }

    return nextDate;
  }

  /**
   * Calculate next monthly occurrence
   */
  private calculateMonthlyNext(currentDate: Date, interval: number): Date {
    const nextDate = new Date(currentDate);
    nextDate.setMonth(currentDate.getMonth() + interval);

    // Handle edge case where the day doesn't exist in the target month
    // (e.g., January 31 -> February 31 becomes February 28/29)
    if (nextDate.getDate() !== currentDate.getDate()) {
      // Set to last day of the month
      nextDate.setDate(0);
    }

    return nextDate;
  }

  /**
   * Calculate next yearly occurrence
   */
  private calculateYearlyNext(currentDate: Date, interval: number): Date {
    const nextDate = new Date(currentDate);
    nextDate.setFullYear(currentDate.getFullYear() + interval);

    // Handle leap year edge case (February 29)
    if (nextDate.getDate() !== currentDate.getDate()) {
      nextDate.setDate(0); // Set to last day of February
    }

    return nextDate;
  }

  /**
   * Parse UNTIL date from RFC 5545 format
   * Format examples: 20251231T235959Z, 20251231
   */
  private parseUntilDate(untilValue: string): Date | null {
    try {
      // Remove 'Z' suffix if present
      const cleanValue = untilValue.replace(/Z$/, '');

      if (cleanValue.length === 8) {
        // Format: YYYYMMDD
        const year = parseInt(cleanValue.substr(0, 4), 10);
        const month = parseInt(cleanValue.substr(4, 2), 10) - 1; // Month is 0-based
        const day = parseInt(cleanValue.substr(6, 2), 10);
        return new Date(year, month, day);
      } else if (cleanValue.length === 15 && cleanValue.includes('T')) {
        // Format: YYYYMMDDTHHMMSS
        const [datePart, timePart] = cleanValue.split('T');
        const year = parseInt(datePart.substr(0, 4), 10);
        const month = parseInt(datePart.substr(4, 2), 10) - 1;
        const day = parseInt(datePart.substr(6, 2), 10);
        const hour = parseInt(timePart.substr(0, 2), 10);
        const minute = parseInt(timePart.substr(2, 2), 10);
        const second = parseInt(timePart.substr(4, 2), 10);
        return new Date(year, month, day, hour, minute, second);
      }

      return null;
    } catch {
      return null;
    }
  }
}
