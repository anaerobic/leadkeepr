/**
 * Next Scheduled Time Calculator Service
 * 
 * Calculates next scheduled times for recurring reminders based on user preferences
 * and recurrence patterns. This service has dependencies on UserPreferencesService
 * and logging/metrics.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { addWeeks } from 'date-fns';
import { DayOfWeek, Reminder } from '../../types';
import {
  parseRecurrence,
  calculateDailyNext,
  calculateWeeklyNext,
  calculateMonthlyNext,
  calculateIntervalNext,
  adjustToAllowedDays,
} from '../utils/reminder-calculations';
import { parseISOToLocalDate, toLocalISOString, extractTimezoneOffset } from '../utils/dates';

export interface NextScheduledTimeParams {
  currentScheduledTime: string;
  reminder: Reminder;
  reminderDays?: DayOfWeek[];
}

export class NextScheduledTimeCalculator {
  constructor(
    private readonly logger: Logger,
    private readonly metrics: Metrics
  ) {}

  /**
   * Calculate the next occurrence for a recurring reminder based on user preferences
   * Uses user-friendly recurrence settings with intelligent date handling
   */
  async calculateNextOccurrence(params: NextScheduledTimeParams): Promise<string | null> {
    const { currentScheduledTime, reminder } = params;

    // Parse the recurrence pattern
    const parsedRecurrence = parseRecurrence(reminder.recurrence);

    if (parsedRecurrence.type === 'once') {
      return null; // No next occurrence for one-time reminders
    }

    // Extract timezone from current scheduled time to maintain consistency
    const timezone = extractTimezoneOffset(currentScheduledTime);
    if (!timezone) {
      this.logger.error('No timezone found in scheduled time', {
        currentScheduledTime,
        reminderId: reminder.uid,
      });
      throw new Error(`No timezone found in scheduled time: ${currentScheduledTime}`);
    }

    // Parse the ISO string to local Date components (avoiding UTC conversion issues)
    // This ensures we work with the actual local time (e.g., 9:30 AM stays 9:30 AM)
    const currentDate = parseISOToLocalDate(currentScheduledTime);

    let nextDate: Date;

    switch (parsedRecurrence.type) {
      case 'daily':
        nextDate = calculateDailyNext(currentDate);
        break;
      case 'weekly':
        nextDate = calculateWeeklyNext(currentDate);
        break;
      case 'monthly':
        nextDate = calculateMonthlyNext(currentDate);
        break;
      case 'interval':
        nextDate = calculateIntervalNext(currentDate, parsedRecurrence.days!);
        break;
      default:
        this.logger.warn('Unknown recurrence pattern, defaulting to weekly', {
          recurrence: reminder.recurrence,
          parsedType: parsedRecurrence.type,
          reminderId: reminder.uid,
        });
        nextDate = addWeeks(currentDate, 1);
        break;
    }

    // Apply reminder day preferences if set
    if (params.reminderDays && params.reminderDays.length > 0) {
      nextDate = adjustToAllowedDays(nextDate, params.reminderDays);
    }

    // Format next date with original timezone offset preserved
    // This ensures the time stays in the user's timezone (e.g., 9:30 AM -07:00 becomes next week at 9:30 AM -07:00)
    return toLocalISOString(nextDate, timezone);
  }

  /**
   * Calculate next scheduled time with error handling and metrics
   * Throws errors to ensure CloudWatch alarms are triggered
   */
  async calculateNextScheduledTime(params: NextScheduledTimeParams): Promise<string | null> {
    try {
      const nextScheduledTime = await this.calculateNextOccurrence(params);
      
      if (!nextScheduledTime) {
        this.logger.error('Failed to calculate next occurrence for recurring reminder', {
          reminder: params.reminder,
          currentScheduledTime: params.currentScheduledTime,
        });
        this.metrics.addMetric('RecurringReminderCalculationFailed', 'Count', 1);
      }

      return nextScheduledTime;
    } catch (error) {
      this.logger.error('Error calculating next scheduled time', {
        error,
        params,
      });
      this.metrics.addMetric('NextScheduledTimeCalculationError', 'Count', 1);
      // Re-throw to ensure CloudWatch alarms are triggered
      throw error;
    }
  }
}