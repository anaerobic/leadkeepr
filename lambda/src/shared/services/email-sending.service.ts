import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { createSESWrapper } from '../aws';
import { isEmailFromDomain, extractEmailAddress } from '../utils/email-addresses';
import { cleanEmailHeader } from '../utils/formatting-utils';

interface EmailSendingResult {
  messageId?: string;
  success: boolean;
  recipientCount?: number;
}

type SESWrapper = ReturnType<typeof createSESWrapper>;

/**
 * Service for sending raw emails via SES
 * Assumes emails are already properly formatted with all headers
 */
export class EmailSendingService {
  constructor(
    private readonly sesWrapper: SESWrapper,
    private readonly logger: Logger,
    private readonly metrics: Metrics,
    private readonly hostedZoneName: string
  ) {}

  /**
   * Send a raw email that's already properly formatted
   * Extracts sender and recipients from email headers
   */
  async sendRawEmail(rawEmailContent: string): Promise<EmailSendingResult> {
    let senderEmail = '';
    let toEmail = '';
    let recipients: string[] = [];
    let messageId: string | undefined;

    try {
      // Extract sender from the raw email headers - handle multiline headers
      const fromMatch = rawEmailContent.match(/^From:\s*(.+?)(?=^\S|\n\n|\r\n\r\n|$)/ms);
      if (!fromMatch) {
        throw new Error('No From header found in email');
      }

      // Clean up multiline header by removing line breaks and extra spaces
      const fromHeader = cleanEmailHeader(fromMatch[1]);
      senderEmail = extractEmailAddress(fromHeader);
      if (!senderEmail) {
        throw new Error('Could not extract sender email from From header');
      }

      // Extract recipients from the To header - handle multiline headers
      const toMatch = rawEmailContent.match(/^To:\s*(.+?)(?=^\S|\n\n|\r\n\r\n|$)/ms);
      if (!toMatch) {
        throw new Error('No To header found in email');
      }

      // Clean up multiline header by removing line breaks and extra spaces
      const toHeader = cleanEmailHeader(toMatch[1]);
      toEmail = extractEmailAddress(toHeader);
      if (!toEmail) {
        throw new Error('Could not extract recipient email from To header');
      }

      // SECURITY: Domain filtering to prevent infinite loops
      // Never send emails to our own domain
      if (this.hostedZoneName && isEmailFromDomain(toEmail, this.hostedZoneName)) {
        this.logger.warn('Refusing to send email to our own domain - preventing infinite loop', {
          toEmail,
          hostedZoneName: this.hostedZoneName,
          action: 'email_send_blocked',
        });

        this.metrics?.addMetric('EmailSendBlocked', 'Count', 1);

        return {
          success: true, // Return success to avoid retries
          recipientCount: 0,
        };
      }

      // SECURITY: Only send to the intended recipient
      // Never send to CC recipients or anyone else to protect privacy
      recipients = [toEmail];

      // We should always have at least one recipient
      if (recipients.length === 0) {
        throw new Error('No recipients found - To email required');
      }

      // Extract message ID for logging - handle multiline headers
      const messageIdMatch = rawEmailContent.match(/^Message-ID:\s*(.+?)(?=^\S|\n\n|\r\n\r\n|$)/ms);
      messageId = messageIdMatch ? cleanEmailHeader(messageIdMatch[1]) : undefined;

      // Use injected SES wrapper for sending email
      const result = await this.sesWrapper.sendRawEmail(senderEmail, recipients, rawEmailContent);

      if (!result.success) {
        throw new Error('Failed to send email via SES wrapper');
      }

      this.logger.info('Successfully sent raw email via SES', {
        messageId: result.messageId || messageId,
        senderEmail,
        toEmail,
        recipientCount: recipients.length,
        recipients: recipients.join(', '),
      });

      return {
        messageId: result.messageId || messageId,
        recipientCount: recipients.length,
        success: true,
      };
    } catch (error) {
      this.logger.error('Failed to send raw email', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorName: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        senderEmail: senderEmail || 'Could not extract',
        toEmail: toEmail || 'Could not extract',
        recipientCount: recipients?.length || 0,
        recipients: recipients?.join(', ') || 'Could not extract',
        // Log first few lines of email for debugging (without sensitive content)
        emailHeaders: rawEmailContent.split('\n\n')[0]?.split('\n').slice(0, 10).join('\n'),
      });
      return {
        success: false,
      };
    }
  }
}
