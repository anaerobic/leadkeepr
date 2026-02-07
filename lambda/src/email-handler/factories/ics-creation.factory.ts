/**
 * ICS Creation Factory - Encapsulates common ICS creation patterns
 *
 * This factory provides standardized methods for creating different types of
 * ICS attachments with consistent organizer/attendee setup and error handling.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { ICSAttachmentService } from '../../shared/services/ics-attachment.service';
import { EmailAttachmentICS } from '../../types';

export interface ICSCreationOptions {
  summary: string;
  startDateTime: string;
  endDateTime?: string;
  timezone: string;
  organizerEmail: string;
  attendeeEmail: string;
  description?: string;
  location?: string;
  uid?: string; // Optional predefined UID
  sequence?: number; // Sequence number for updates
}

export interface RecurringICSOptions extends ICSCreationOptions {
  recurrenceRule: string;
}

export class ICSCreationFactory {
  constructor(
    private readonly icsService: ICSAttachmentService,
    private readonly logger: Logger
  ) {}

  /**
   * Create a reminder ICS attachment with contextual content
   */
  createReminderAttachment(
    reminder: {
      text: string;
      dateTime: string;
      contextualTitle: string;
      contextualDescription: string;
      uid?: string; // Optional predefined UID
    },
    options: Pick<ICSCreationOptions, 'timezone' | 'organizerEmail' | 'attendeeEmail'>
  ): EmailAttachmentICS | null {
    try {
      const baseOptions: ICSCreationOptions = {
        summary: reminder.contextualTitle,
        startDateTime: reminder.dateTime,
        timezone: options.timezone,
        organizerEmail: options.organizerEmail,
        attendeeEmail: options.attendeeEmail,
        description: reminder.contextualDescription,
        uid: reminder.uid, // Pass through the UID if provided
      };

      // Always create single-occurrence ICS files for reminders
      // Recurrence is handled by EventBridge scheduling, not calendar recurrence
      return this.icsService.createOneTimeEventICS(baseOptions);
    } catch (error) {
      this.logger.warn('Failed to create ICS attachment for reminder', {
        error: error instanceof Error ? error.message : String(error),
        reminder,
      });
      return null;
    }
  }

  /**
   * Create a reminder UPDATE attachment (sequence=1 for updates)
   */
  createReminderUpdateAttachment(
    reminder: {
      text: string;
      dateTime: string;
      contextualTitle: string;
      contextualDescription: string;
      uid?: string; // Should be provided for updates
    },
    options: Pick<ICSCreationOptions, 'timezone' | 'organizerEmail' | 'attendeeEmail'>
  ): EmailAttachmentICS | null {
    try {
      const baseOptions: ICSCreationOptions = {
        summary: reminder.contextualTitle,
        startDateTime: reminder.dateTime,
        timezone: options.timezone,
        organizerEmail: options.organizerEmail,
        attendeeEmail: options.attendeeEmail,
        description: reminder.contextualDescription,
        uid: reminder.uid, // Use original UID for update
        sequence: 1, // Increment sequence for update
      };

      // Always create single-occurrence ICS files for reminders
      // Recurrence is handled by EventBridge scheduling, not calendar recurrence
      return this.icsService.createOneTimeEventICS(baseOptions);
    } catch (error) {
      this.logger.error('Failed to create UPDATE ICS attachment for reminder', {
        error: error instanceof Error ? error.message : String(error),
        reminder,
      });
      return null;
    }
  }

  /**
   * Create a cancellation ICS attachment for a previously sent item
   */
  createCancellationAttachment(
    cancellation: {
      originalText: string;
      contextualTitle: string;
      reason?: string;
    },
    uid: string,
    originalDateTime: string,
    options: Pick<ICSCreationOptions, 'timezone' | 'organizerEmail' | 'attendeeEmail'>
  ): EmailAttachmentICS {
    return this.icsService.createCancellationICS({
      uid,
      summary: cancellation.contextualTitle,
      startDateTime: originalDateTime,
      organizerEmail: options.organizerEmail,
      attendeeEmail: options.attendeeEmail,
      timezone: options.timezone,
      cancellationReason: cancellation.reason || `Cancelled: ${cancellation.originalText}`,
    });
  }
}
