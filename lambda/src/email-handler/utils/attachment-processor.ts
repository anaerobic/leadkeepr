/**
 * Attachment Processing Utilities - Centralized ICS attachment creation
 *
 * Encapsulates the complex logic for determining which ICS attachments to create
 * based on email analysis results and provides unified error handling.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { ICSCreationFactory } from '../factories/ics-creation.factory';
import { EmailAttachmentICS, EmailIntentAnalysisItems } from '../../types';

export interface AttachmentOptions {
  timezone: string;
  organizerEmail: string;
  attendeeEmail: string;
}

export class AttachmentProcessor {
  constructor(
    private readonly icsFactory: ICSCreationFactory,
    private readonly logger: Logger
  ) {}

  /**
   * Determine if ICS attachments are needed based on analysis results
   */
  needsICSAttachments(analysis: EmailIntentAnalysisItems): boolean {
    return analysis.reminders.length > 0;
  }

  /**
   * Create all necessary ICS attachments based on analysis results
   * Using the new status-based approach (new/updated/cancelled)
   */
  async createICSAttachments(
    analysis: EmailIntentAnalysisItems,
    options: AttachmentOptions
  ): Promise<Array<EmailAttachmentICS>> {
    const attachments: Array<EmailAttachmentICS> = [];

    // Process reminders based on status
    for (const reminder of analysis.reminders) {
      const status = reminder.status || 'new';

      if (status === 'cancelled' && reminder.uid) {
        // Skip ICS creation for cancellations without original dateTime
        if (!reminder.dateTime) {
          this.logger.warn('Skipping ICS cancellation attachment for reminder without dateTime', {
            uid: reminder.uid,
            contextualTitle: reminder.contextualTitle,
            text: reminder.text,
          });
          continue;
        }

        // Create cancellation attachment
        const cancellationAttachment = this.icsFactory.createCancellationAttachment(
          {
            originalText: reminder.text,
            contextualTitle: reminder.contextualTitle,
            reason: 'Cancelled by user request',
          },
          reminder.uid,
          reminder.dateTime,
          options
        );
        attachments.push(cancellationAttachment);
      } else if (status === 'updated' && reminder.uid) {
        // Create update attachment
        const updateAttachment = this.icsFactory.createReminderUpdateAttachment(reminder, options);
        if (updateAttachment) {
          attachments.push(updateAttachment);
        }
      } else {
        // Create new reminder attachment
        const attachment = this.icsFactory.createReminderAttachment(reminder, options);
        if (attachment) {
          attachments.push(attachment);
        }
      }
    }

    return attachments;
  }
}
