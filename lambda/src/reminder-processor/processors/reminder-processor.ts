/**
 * Reminder Processor Service
 *
 * Processes scheduled reminder SQS messages by:
 * 1. Extracting reminder data from DynamoDB using reminder ID
 * 2. Composing appropriate reminder email
 * 3. Sending reminder email via ReplyComposerService
 * 4. Optionally scheduling recurring reminders
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { EmailRepository } from '../../shared/repositories/email.repository';
import { ReplyComposerService } from '../../shared/services/reply-composer.service';
import { ReminderScheduleRequest, SchedulerService } from '../../shared/services/scheduler.service';
import { ICSAttachmentService } from '../../shared/services/ics-attachment.service';
import { UserPreferencesService } from '../../shared/services/user-preferences.service';
import { NextScheduledTimeCalculator } from '../../shared/services/next-scheduled-time-calculator.service';
import { EmailRecord, IncomingEmailParsed, Reminder } from '../../types';

export class ReminderProcessor {
  constructor(
    private readonly emailRepository: EmailRepository,
    private readonly replyComposerService: ReplyComposerService,
    private readonly schedulerService: SchedulerService,
    private readonly icsAttachmentService: ICSAttachmentService,
    private readonly userPreferencesService: UserPreferencesService,
    private readonly nextScheduledTimeCalculator: NextScheduledTimeCalculator,
    private readonly logger: Logger,
    private readonly metrics: Metrics
  ) { }

  /**
   * Process a scheduled reminder from SQS event
   */
  async processReminder(detail: ReminderScheduleRequest): Promise<void> {
    const {
      reminderId,
      scheduledTime: currentScheduledTime,
      gsi1Pk,
    } = detail;

    // Get emails from DynamoDB using gsi1Pk for user-scoped thread isolation
    const threadEmails = await this.emailRepository.getEmailsByThreadId(gsi1Pk);

    if (threadEmails.length === 0) {
      this.logger.warn('No emails found for thread', {
        gsi1Pk,
        reminderId,
      });
      this.metrics.addMetric('ReminderThreadNotFound', 'Count', 1);
      return;
    }

    // Find the latest reminder request for the reminderId (uid) in the email analyses ordered by email date desc
    let reminder: Reminder | undefined;
    let latestEmail: EmailRecord | undefined;

    // Sort emails by date descending to find the most recent reminder
    const sortedEmails = [...threadEmails].sort(
      (a, b) => new Date(b.emailDate).getTime() - new Date(a.emailDate).getTime()
    );

    for (const email of sortedEmails) {
      const reminders = email.emailIntentAnalysis?.reminders || [];
      const foundReminder = reminders.find((r) => r.uid === reminderId);

      if (foundReminder) {
        reminder = foundReminder;
        latestEmail = email;
        break;
      }
    }

    if (!reminder || !latestEmail) {
      this.logger.warn('Reminder request not found in thread emails', {
        gsi1Pk,
        reminderId,
        emailsChecked: sortedEmails.length,
      });
      this.metrics.addMetric('ReminderRequestNotFound', 'Count', 1);
      return;
    }

    // If reminder is not cancelled then compose and send reminder email
    if (reminder.status === 'cancelled') {
      this.logger.warn('Reminder was cancelled, skipping', {
        reminderId,
        gsi1Pk,
      });
      this.metrics.addMetric('ReminderCancelled', 'Count', 1);
      return;
    }

    // Extract user email from gsi1Pk (format: "user@example.com#threadId")
    const userEmail = gsi1Pk.split('#')[0];

    // Get user preferences
    const userPreferences = await this.userPreferencesService.getUserPreferences(userEmail);

    let nextScheduledTime: string | null = null;

    // For recurring reminders, calculate next occurrence
    if (reminder.recurrence !== 'once') {
      nextScheduledTime = await this.nextScheduledTimeCalculator.calculateNextScheduledTime({
        currentScheduledTime,
        reminder,
        reminderDays: userPreferences?.reminderDays,
      })

      if (!nextScheduledTime) {
        this.logger.error('Failed to calculate next scheduled time for reminder', {
          reminderId,
          gsi1Pk,
          currentScheduledTime,
        });
        this.metrics.addMetric('ReminderNextScheduledTimeCalculationFailed', 'Count', 1);
        throw new Error('Failed to calculate next scheduled time for reminder');
      }

      await this.scheduleRecurringReminder({
        nextScheduledTime,
        gsi1Pk,
        latestEmail,
        reminder,
      });
    }

    // Send reminder email with ICS attachment
    await this.sendReminderEmail({
      reminder,
      originalEmail: latestEmail,
      gsi1Pk,
      nextScheduledTime,
      timezone: userPreferences?.timezone || 'UTC',
    });

    this.metrics.addMetric('ReminderProcessed', 'Count', 1);
  }

  /**
   * Send the reminder email with ICS attachment for recurring reminders: uses next scheduledTime for next occurrence
   */
  private async sendReminderEmail(
    {
      gsi1Pk,
      nextScheduledTime,
      originalEmail,
      reminder,
      timezone,
    }: {
      gsi1Pk: string,
      nextScheduledTime: string | null,
      originalEmail: EmailRecord,
      reminder: Reminder,
      timezone: string
    }
  ): Promise<void> {
    // Extract user email from gsi1Pk (format: "user@example.com#threadId")
    const userEmail = gsi1Pk.split('#')[0];

    // Create ICS attachment based on reminder type:
    // - For one-time reminders: no ICS attachment (they won't recur)
    // - For recurring reminders: include ICS for next occurrence
    let icsAttachment = null;

    const willCreateICS = reminder.recurrence !== 'once' && !!nextScheduledTime;

    this.logger.debug('Evaluating ICS attachment for reminder email', {
      reminderUid: reminder.uid,
      recurrence: reminder.recurrence,
      nextScheduledTime,
      willCreateICS,
    });

    if (willCreateICS) {
      icsAttachment = this.icsAttachmentService.createOneTimeEventICS({
        summary: reminder.contextualTitle,
        startDateTime: nextScheduledTime,
        timezone,
        organizerEmail: userEmail,
        attendeeEmail: userEmail,
        description: reminder.contextualDescription,
        uid: reminder.uid,
      });

      this.logger.info('Created ICS attachment for recurring reminder', {
        reminderUid: reminder.uid,
        recurrence: reminder.recurrence,
        nextScheduledTime,
        hasAttachment: !!icsAttachment,
      });
    }

    const parsedEmailForReply: IncomingEmailParsed = {
      messageId: originalEmail.messageId,
      from: originalEmail.from,
      to: originalEmail.to,
      subject: originalEmail.subject,
      emailDate: originalEmail.emailDate,
      inReplyTo: originalEmail.messageId,
      references: originalEmail.messageId,
      attachments: [], // Attachments are passed as separate parameter to sendReplyEmail
    };

    // Use ReplyComposerService to send the reminder with ICS attachment as third parameter
    await this.replyComposerService.sendReplyEmail(
      parsedEmailForReply,
      reminder.contextualDescription,
      icsAttachment ? [icsAttachment] : undefined
    );
  }

  /**
   * Schedule the next occurrence of a recurring reminder
   * Calculate the next occurrence locally then use simplified scheduler
   */
  private async scheduleRecurringReminder(
    {
      nextScheduledTime,
      reminder,
      latestEmail,
      gsi1Pk,
    }: {
      nextScheduledTime: string,
      reminder: Reminder;
      latestEmail: EmailRecord;
      gsi1Pk: string
    }
  ): Promise<void> {

    // Use simple scheduler with pre-calculated time (no recurrence pattern needed)
    const result = await this.schedulerService.createOrUpdateReminderSchedule({
      reminderId: reminder.uid,
      gsi1Pk,
      scheduledTime: nextScheduledTime,
      description: `Sender: ${latestEmail.pk}\nThread: ${latestEmail.threadId}\nSubject: ${latestEmail.subject}`,
    });

    if (!result.success) {
      this.logger.error('Failed to schedule next recurring reminder', {
        reminder,
        gsi1Pk,
        nextScheduledTime,
        error: result.error,
      });

      this.metrics.addMetric('RecurringReminderSchedulingFailed', 'Count', 1);
    } else {
      this.logger.debug('Successfully scheduled next recurring reminder', {
        reminder,
        gsi1Pk,
        nextScheduledTime,
      });
    }
  }
}
