import { Logger } from '@aws-lambda-powertools/logger';
import {
  ScheduleRequest,
  ScheduleResult,
  SchedulerWrapper,
} from '../aws/scheduler-wrapper';

export interface SchedulerConfig {
  reminderId: string;
  gsi1Pk: string; // User-scoped thread ID (e.g., "user@example.com#msg1234@foo.org")
  scheduledTime: string;
  description: string; // Description for the schedule
}

export interface ReminderScheduleRequest {
  reminderId: string;
  scheduledTime: string;
  gsi1Pk: string; // User-scoped thread ID for thread isolation
}

/**
 * Shared scheduler service for creating EventBridge schedules
 * Used by both analysis-response-generator and reminder-processor lambdas
 * Simplified approach: OpenAI already calculated the proper scheduledTime with timezone awareness
 */
export class SchedulerService {
  constructor(
    private readonly schedulerWrapper: SchedulerWrapper,
    private readonly logger: Logger,
    private readonly scheduleGroupName: string,
    private readonly targetSqsQueueArn: string,
    private readonly executionRoleArn: string
  ) { }

  /**
   * Create or update a thread-based reminder schedule
   * If a reminder already exists for the thread, update it with new time/details
   *
   * SIMPLIFIED APPROACH: OpenAI provides scheduledTime as proper ISO timestamp.
   * The format is: "2025-09-06T00:00:00.000-07:00"
   * This means 00:00 (midnight) in Pacific time (-07:00), NOT 00:00 UTC.
   *
   * For EventBridge with timezone parameter:
   * - Extract the local time components (00:00:00 from the example)
   * - Extract the timezone (-07:00 -> America/Los_Angeles)
   * - EventBridge will handle the rest
   */
  async createOrUpdateReminderSchedule(config: SchedulerConfig): Promise<ScheduleResult> {
    const scheduleName = config.reminderId;

    try {
      // Parse the scheduled time to check if it's in the past
      // new Date() converts the ISO string to UTC for comparison
      const scheduledDate = new Date(config.scheduledTime);
      const now = new Date();

      // Check if the scheduled time is in the past
      if (scheduledDate <= now) {
        // Schedule for immediate execution (1 minute from now)
        // For simplicity, use UTC time when scheduling immediate execution
        const immediateDate = new Date(now.getTime() + 60 * 1000);
        const immediateTimeString = immediateDate.toISOString().slice(0, 19);
        return this.createScheduleWithLocalTime(immediateTimeString, config, 'UTC');
      }

      // Extract timezone for EventBridge
      const timezone = this.extractTimezoneForEventBridge(config.scheduledTime);

      // Extract local time components from the original ISO string
      const localTimeComponents = this.extractLocalTimeComponents(config.scheduledTime);

      return this.createScheduleWithLocalTime(localTimeComponents, config, timezone);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to create or update reminder schedule', {
        scheduleName,
        gsi1Pk: config.gsi1Pk,
        scheduledTime: config.scheduledTime,
        error: errorMessage,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }



  /**
   * Cancel a reminder schedule by deleting it from EventBridge
   */
  async cancelReminderSchedule(reminderId: string): Promise<ScheduleResult> {
    const scheduleName = reminderId;

    this.logger.info('Attempting to delete EventBridge schedule', {
      reminderId,
      scheduleName,
      scheduleGroupName: this.scheduleGroupName,
    });

    try {
      const result = await this.schedulerWrapper.deleteSchedule(
        scheduleName,
        this.scheduleGroupName
      );

      if (result.success) {
        this.logger.info('Successfully deleted EventBridge schedule', {
          reminderId,
          scheduleName,
        });
      } else {
        this.logger.warn('Failed to delete EventBridge schedule', {
          reminderId,
          scheduleName,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to cancel reminder schedule', {
        reminderId,
        scheduleName,
        error: errorMessage,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Extract local time components from ISO string for EventBridge scheduling
   * "2025-09-06T00:00:00.000-07:00" -> "2025-09-06T00:00:00"
   * "2025-09-06T00:00:00Z" -> "2025-09-06T00:00:00"
   */
  private extractLocalTimeComponents(isoString: string): string {
    // Remove timezone part and milliseconds, keep just the local time
    // Handle both offset format (-07:00) and Z format
    return isoString.replace(/(\.\d{3})?([+-]\d{2}:\d{2}|Z)$/, '');
  }

  /**
   * Create the actual schedule using local time components
   */
  private async createScheduleWithLocalTime(
    localTimeComponents: string,
    config: SchedulerConfig,
    timezone: string
  ): Promise<ScheduleResult> {
    // EventBridge 'at' expression expects: at(YYYY-MM-DDTHH:MM:SS)
    const scheduleExpression = `at(${localTimeComponents})`;

    const reminderPayload: ReminderScheduleRequest = {
      reminderId: config.reminderId,
      scheduledTime: config.scheduledTime,
      gsi1Pk: config.gsi1Pk,
    };

    // Create business-focused request
    const payload: ScheduleRequest<ReminderScheduleRequest> = {
      name: config.reminderId,
      scheduleExpression,
      timezone,
      payload: reminderPayload,
      description: config.description,
    };

    // Calculate DLQ ARN using convention: targetSqsQueueArn + '-dlq'
    const deadLetterQueueArn = `${this.targetSqsQueueArn}-dlq`;

    // Configure retry policy: 1 hour (3600 seconds) and 3 attempts
    const retryPolicy = {
      MaximumEventAgeInSeconds: 3600, // 1 hour
      MaximumRetryAttempts: 3,
    };

    const result = await this.schedulerWrapper.createReminderSchedule(
      payload,
      this.scheduleGroupName,
      this.targetSqsQueueArn,
      this.executionRoleArn,
      {
        retryPolicy,
        deadLetterQueueArn,
      }
    );

    // Handle case where wrapper returns undefined (shouldn't happen but adds robustness)
    if (!result) {
      return {
        success: false,
        error: 'Scheduler wrapper returned undefined result',
      };
    }

    return result;
  }

  /**
   * Extract timezone for EventBridge from ISO string
   * Maps timezone offsets to IANA timezone names when possible
   */
  private extractTimezoneForEventBridge(scheduledTime: string): string {
    // Check for Z format (UTC)
    if (scheduledTime.endsWith('Z')) {
      return 'UTC';
    }

    // Check for offset format (+/-HH:MM)
    const timezoneMatch = scheduledTime.match(/([+-]\d{2}:\d{2})$/);
    if (!timezoneMatch) {
      return 'UTC'; // Default fallback
    }

    const offset = timezoneMatch[1];

    // Map common timezone offsets to IANA names
    // EventBridge will handle DST transitions automatically
    switch (offset) {
      case '+00:00':
        return 'UTC';
      case '-08:00': // Pacific Standard Time (winter)
      case '-07:00': // Pacific Daylight Time (summer)
        return 'America/Los_Angeles';
      case '-06:00': // Central Standard Time (winter) or Mountain Daylight Time (summer)
        return 'America/Chicago'; // Assume Central time zone
      case '-05:00': // Eastern Standard Time (winter) or Central Daylight Time (summer)
        return 'America/New_York'; // Assume Eastern time zone (more common)
      case '-04:00': // Eastern Daylight Time (summer)
        return 'America/New_York';
      default:
        return 'UTC';
    }
  }

  /**
   * Format a Date object as ISO string while preserving the timezone from the original scheduled time
   * This prevents losing timezone information when using Date.toISOString() which always returns UTC
   *
   * Key insight: The RRULE parser correctly calculates the next occurrence in UTC time.
   * We need to format this UTC time to show what the "local time" would be in the original timezone.
   */
  private preserveTimezoneInISOString(nextOccurrence: Date, originalScheduledTime: string): string {
    // Extract the timezone suffix from the original scheduled time
    const timezoneMatch = originalScheduledTime.match(/([+-]\d{2}:\d{2}|Z)$/);
    const timezoneSuffix = timezoneMatch ? timezoneMatch[1] : 'Z';

    if (timezoneSuffix === 'Z') {
      // Original was in UTC, so just return the UTC time
      return nextOccurrence.toISOString();
    }

    // Parse the timezone offset (e.g., "-07:00" -> -420 minutes)
    const offsetMatch = timezoneSuffix.match(/([+-])(\d{2}):(\d{2})/);
    if (!offsetMatch) {
      // Fallback to UTC if we can't parse the offset
      return nextOccurrence.toISOString();
    }

    const sign = offsetMatch[1] === '+' ? 1 : -1;
    const offsetHours = parseInt(offsetMatch[2], 10);
    const offsetMinutes = parseInt(offsetMatch[3], 10);
    const totalOffsetMinutes = sign * (offsetHours * 60 + offsetMinutes);

    // Apply the timezone offset to get the local time
    const localTime = new Date(nextOccurrence.getTime() - totalOffsetMinutes * 60 * 1000);

    // Format as ISO string but replace 'Z' with original timezone
    const isoString = localTime.toISOString();
    return isoString.substring(0, 19) + timezoneSuffix;
  }
}
