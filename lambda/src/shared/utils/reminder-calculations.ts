/**
 * Reminder calculation utilities
 * Pure functions for calculating reminder occurrences without external dependencies
 */

import { addDays, addWeeks, addMonths, getDay } from 'date-fns';
import { Recurrence, DayOfWeek, DAYS_OF_WEEK } from '../../types';

export interface ParsedRecurrence {
  type: 'once' | 'daily' | 'weekly' | 'monthly' | 'interval';
  days?: number; // Used for interval type
}

/**
 * Parse recurrence pattern into structured format
 */
export function parseRecurrence(recurrence: 'once' | Recurrence): ParsedRecurrence {
  if (recurrence === "once") return { type: "once" };
  if (recurrence === "daily") return { type: "daily", days: 1 };
  if (recurrence === "weekly") return { type: "weekly", days: 7 };
  if (recurrence === "monthly") return { type: "monthly", days: 30 };

  const match = recurrence.match(/^every-(\d+)-days$/);
  if (match) return { type: "interval", days: parseInt(match[1], 10) };

  // Fallback for unknown patterns
  return { type: "interval", days: 2 };
}

/**
 * Calculate next daily occurrence
 */
export function calculateDailyNext(currentDate: Date): Date {
  return addDays(currentDate, 1);
}

/**
 * Calculate next weekly occurrence
 */
export function calculateWeeklyNext(currentDate: Date): Date {
  return addWeeks(currentDate, 1);
}

/**
 * Calculate next monthly occurrence with intelligent date handling
 * If the current date is the 31st and next month has only 30 days, 
 * it will be the 30th (last day of month)
 */
export function calculateMonthlyNext(currentDate: Date): Date {
  return addMonths(currentDate, 1);
}

/**
 * Calculate next interval occurrence (every N days)
 */
export function calculateIntervalNext(currentDate: Date, intervalDays: number): Date {
  return addDays(currentDate, intervalDays);
}

/**
 * Adjust a date to the next allowed day based on user's reminderDays preference
 * Handles both simple cases and complex recurrence patterns like "every-2-days"
 */
export function adjustToAllowedDays(date: Date, allowedDays: DayOfWeek[]): Date {
  // Convert day names to numeric values (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayNameToNumber = DAYS_OF_WEEK.reduce((acc, day, index) => ({
    ...acc,
    [day]: index,
  }), {} as Record<DayOfWeek, number>);

  const allowedDayNumbers = allowedDays.map(day => dayNameToNumber[day]).filter(num => num !== undefined);

  if (allowedDayNumbers.length === 0) {
    // No valid days specified, return original date
    return date;
  }

  const currentDayOfWeek = getDay(date); // 0 = Sunday, 1 = Monday, etc.

  // If current day is already allowed, return it
  if (allowedDayNumbers.includes(currentDayOfWeek)) {
    return date;
  }

  // Find the next allowed day
  let daysToAdd = 1;
  let nextDate = addDays(date, daysToAdd);

  // Search for the next allowed day within the next 7 days
  while (daysToAdd <= 7) {
    const nextDayOfWeek = getDay(nextDate);
    if (allowedDayNumbers.includes(nextDayOfWeek)) {
      return nextDate;
    }
    daysToAdd++;
    nextDate = addDays(date, daysToAdd);
  }

  // Fallback: if no allowed day found in the next week, return the first allowed day of next week
  const sortedAllowedDays = [...allowedDayNumbers].sort((a, b) => a - b);
  const firstAllowedDay = sortedAllowedDays[0];

  // Calculate days until the first allowed day of next week
  let daysUntilFirstAllowed = (firstAllowedDay + 7 - currentDayOfWeek) % 7;
  if (daysUntilFirstAllowed === 0) {
    daysUntilFirstAllowed = 7; // Next week
  }

  return addDays(date, daysUntilFirstAllowed);
}