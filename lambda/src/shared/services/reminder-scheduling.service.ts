/**
 * Reminder Scheduling Service
 *
 * Handles scheduling and cancellation of reminders detected in email analysis.
 * Manages past reminder adjustment, EventBridge scheduling, and error handling.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { EmailRecord, UserPreferencesRecord, Reminder } from '../../types';
import { SchedulerService } from './scheduler.service';
import { NextScheduledTimeCalculator } from './next-scheduled-time-calculator.service';

export class ReminderSchedulingService {
  constructor(
    private readonly logger: Logger,
    private readonly metrics: Metrics,
    private readonly schedulerService: SchedulerService,
    private readonly nextScheduledTimeCalculator: NextScheduledTimeCalculator
  ) {}

  /**
   * Schedule reminders detected in the email analysis
   */
  async scheduleEmailReminders(
    emailRecord: EmailRecord,
    userPreferences: UserPreferencesRecord
  ): Promise<void> {
    const startTime = Date.now();
    const reminders = emailRecord.emailIntentAnalysis?.reminders || [];

    this.logger.info('Starting reminder scheduling', {
      messageId: emailRecord.messageId,
      threadId: emailRecord.threadId,
      reminderCount: reminders.length,
    });

    if (reminders.length === 0) {
      this.logger.debug('No reminders to schedule', {
        messageId: emailRecord.messageId,
      });
      return;
    }

    // Schedule each reminder request
    let processedCount = 0;
    let cancelledCount = 0;
    let scheduledCount = 0;
    let errorCount = 0;

    for (const reminder of reminders) {
      processedCount++;
      
      if (reminder.status === 'cancelled') {
        cancelledCount++;
        await this.processCancelledReminder(reminder, emailRecord);
        continue;
      }

      try {
        // The AI should provide UIDs for all reminders. If uid is null, skip scheduling
        if (!reminder.uid) {
          this.logger.warn('Skipping reminder scheduling - AI did not provide UID', {
            messageId: emailRecord.messageId,
            threadId: emailRecord.threadId,
            reminderIndex: processedCount,
            contextualTitle: reminder.contextualTitle,
            text: reminder.text,
          });
          continue;
        }

        // Check if reminder is in the past and adjust if recurring
        const scheduledTime = await this.adjustPastReminderIfNeeded(
          reminder,
          userPreferences,
          emailRecord,
          processedCount
        );

        if (!scheduledTime) {
          continue; // Skip this reminder if we couldn't calculate a valid time
        }

        this.logger.info('Scheduling new reminder', {
          messageId: emailRecord.messageId,
          reminderIndex: processedCount,
          uid: reminder.uid,
          contextualTitle: reminder.contextualTitle,
          dateTime: scheduledTime,
        });

        // Schedule the reminder with all required data serialized
        const scheduleResult = await this.schedulerService.createOrUpdateReminderSchedule({
          reminderId: reminder.uid,
          gsi1Pk: emailRecord.gsi1Pk!,
          scheduledTime: scheduledTime,
          description: `Sender: ${emailRecord.pk}\nThread: ${emailRecord.threadId}\nSubject: ${emailRecord.subject}`,
        });

        if (!scheduleResult.success) {
          errorCount++;
          this.logger.error('Failed to schedule reminder', {
            messageId: emailRecord.messageId,
            threadId: emailRecord.threadId,
            reminderIndex: processedCount,
            uid: reminder.uid,
            contextualTitle: reminder.contextualTitle,
            error: scheduleResult.error,
          });

          this.metrics.addMetric('ReminderSchedulingFailed', 'Count', 1);
        } else {
          scheduledCount++;
          this.logger.debug('Successfully scheduled reminder', {
            messageId: emailRecord.messageId,
            reminderIndex: processedCount,
            uid: reminder.uid,
            contextualTitle: reminder.contextualTitle,
            dateTime: scheduledTime,
          });
        }
      } catch (error) {
        errorCount++;
        this.logger.error('Error scheduling reminder', {
          messageId: emailRecord.messageId,
          threadId: emailRecord.threadId,
          reminderIndex: processedCount,
          uid: reminder.uid,
          contextualTitle: reminder.contextualTitle,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        this.metrics.addMetric('ReminderSchedulingError', 'Count', 1);
      }
    }

    const totalDuration = Date.now() - startTime;

    this.logger.info('Reminder scheduling completed', {
      messageId: emailRecord.messageId,
      threadId: emailRecord.threadId,
      totalReminders: processedCount,
      scheduledCount,
      cancelledCount,
      errorCount,
      durationMs: totalDuration,
    });
  }

  /**
   * Process a cancelled reminder
   */
  private async processCancelledReminder(
    reminder: Reminder,
    emailRecord: EmailRecord
  ): Promise<void> {
    // Populate cancellation metadata if not already set
    if (!reminder.cancelledAt) {
      reminder.cancelledAt = new Date().toISOString();
    }
    if (!reminder.cancellationReason && emailRecord.emailIntentAnalysis?.summary) {
      reminder.cancellationReason = `Cancelled via email: ${emailRecord.emailIntentAnalysis.summary.substring(0, 100)}`;
    }

    this.logger.info('Processing cancelled reminder', {
      messageId: emailRecord.messageId,
      uid: reminder.uid,
      uidType: typeof reminder.uid,
      contextualTitle: reminder.contextualTitle,
      text: reminder.text,
      cancelledAt: reminder.cancelledAt,
      cancellationReason: reminder.cancellationReason,
    });

    if (reminder.uid) {
      await this.cancelReminder(reminder.uid);
    } else {
      this.logger.warn('Skipping cancellation - no UID provided', {
        messageId: emailRecord.messageId,
        uid: reminder.uid,
        uidType: typeof reminder.uid,
        contextualTitle: reminder.contextualTitle,
        text: reminder.text,
      });
    }
  }

  /**
   * Adjust past reminders to their next scheduled occurrence
   * Returns the adjusted time, or null if the reminder should be skipped
   */
  private async adjustPastReminderIfNeeded(
    reminder: Reminder,
    userPreferences: UserPreferencesRecord,
    emailRecord: EmailRecord,
    reminderIndex: number
  ): Promise<string | null> {
    let scheduledTime = reminder.dateTime;
    const reminderDate = new Date(reminder.dateTime);
    const now = new Date();

    if (reminderDate < now && reminder.recurrence !== 'once') {
      this.logger.info('Detected past reminder with recurrence - calculating next occurrence', {
        messageId: emailRecord.messageId,
        reminderIndex,
        uid: reminder.uid,
        originalDateTime: reminder.dateTime,
        recurrence: reminder.recurrence,
      });

      const nextScheduledTime = await this.nextScheduledTimeCalculator.calculateNextScheduledTime({
        currentScheduledTime: reminder.dateTime,
        reminder,
        reminderDays: userPreferences?.reminderDays,
      });

      if (nextScheduledTime) {
        scheduledTime = nextScheduledTime;
        this.logger.info('Adjusted past reminder to next occurrence', {
          messageId: emailRecord.messageId,
          reminderIndex,
          uid: reminder.uid,
          originalDateTime: reminder.dateTime,
          adjustedDateTime: scheduledTime,
          recurrence: reminder.recurrence,
        });
        this.metrics.addMetric('PastReminderAdjusted', 'Count', 1);
      } else {
        this.logger.warn('Could not calculate next occurrence for past reminder - skipping', {
          messageId: emailRecord.messageId,
          reminderIndex,
          uid: reminder.uid,
          originalDateTime: reminder.dateTime,
          recurrence: reminder.recurrence,
        });
        return null;
      }
    }

    return scheduledTime;
  }

  /**
   * Cancel a reminder by its ID
   */
  private async cancelReminder(reminderId: string): Promise<void> {
    this.logger.info('Attempting to cancel reminder', {
      reminderId,
    });

    try {
      const result = await this.schedulerService.cancelReminderSchedule(reminderId);

      if (!result.success) {
        this.logger.warn('Failed to cancel reminder', {
          reminderId,
          error: result.error,
        });
      } else {
        this.logger.info('Successfully cancelled reminder', {
          reminderId,
        });
      }
    } catch (error) {
      this.logger.error('Error cancelling reminder', {
        reminderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
