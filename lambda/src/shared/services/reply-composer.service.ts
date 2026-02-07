import { referencesToString } from '../utils/threading';
import { Logger } from '@aws-lambda-powertools/logger';
import { generateRandomId } from '../utils/formatting-utils';
import { EmailAttachmentICS, IncomingEmailParsed } from '../../types';
import { EmailSendingService } from './email-sending.service';
import {
  buildMultipartAlternativeEmail,
  buildMultipartEmailWithICS,
  extractTextFromHtml,
  EmailHeaders,
  EmailContent,
  ICSAttachment,
} from '../utils/email-builder';

/**
 * ReplyComposerService
 *
 * A specialized reply composer service tailored for the email processor.
 * This service focuses on creating replies based on the unified email intent analysis,
 * with special handling for calendar events, reminders, and action items.
 */
export class ReplyComposerService {
  constructor(
    private readonly emailSendingService: EmailSendingService,
    private readonly replyFromEmail: string,
    private readonly logger: Logger,
    private readonly env: {
      readonly fqdn: string;
    }
  ) {}

  /**
   * Build email headers for the email builder utility
   */
  private buildEmailHeaders(parsedEmail: Omit<IncomingEmailParsed, 'attachments'>): EmailHeaders {
    // Avoid adding "Re: " if the subject already starts with it
    const replySubject = parsedEmail.subject.startsWith('Re: ')
      ? parsedEmail.subject
      : `Re: ${parsedEmail.subject}`;

    // Generate new Message-ID for our reply
    const replyMessageId = `<reply-${Date.now()}-${generateRandomId()}@${this.env.fqdn}>`;

    // Build references string
    const newReferences = parsedEmail.references
      ? `${referencesToString(parsedEmail.references)} ${parsedEmail.messageId}`
      : parsedEmail.messageId;

    return {
      from: `leadkeepr <${this.replyFromEmail}>`,
      to: parsedEmail.from,
      subject: replySubject,
      date: new Date().toUTCString(),
      messageId: replyMessageId,
      inReplyTo: parsedEmail.messageId,
      references: newReferences || undefined,
    };
  }

  /**
   * Compose a complete email reply using email builder utilities
   */
  async composeReply(
    parsedEmail: Omit<IncomingEmailParsed, 'attachments'>,
    replyBody: string,
    icsAttachments: Array<EmailAttachmentICS> = []
  ): Promise<string> {
    // Build email headers
    const headers = this.buildEmailHeaders(parsedEmail);

    // Build email content
    const content: EmailContent = {
      html: replyBody,
      text: extractTextFromHtml(replyBody),
    };

    if (icsAttachments.length === 0) {
      // Simple multipart/alternative email when no calendar attachments
      return buildMultipartAlternativeEmail(headers, content);
    }

    // Convert ICS attachments to the email builder format
    const icsAttachmentsForBuilder: ICSAttachment[] = icsAttachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      method: 'REQUEST', // Default method for calendar invites
    }));

    // Use multipart/mixed with ICS attachments
    return buildMultipartEmailWithICS(headers, content, icsAttachmentsForBuilder);
  }

  /**
   * Add customization footer for first replies in new threads
   */
  private addCustomizationFooter(replyBody: string, isNewThread: boolean): string {
    // Always include the HR for visual separation, but only add footer text for new threads
    let htmlContent = `${this.escapeHtml(replyBody)}
<hr style="margin: 20px 0 0 0; border: none; border-top: 1px solid #ccc;">`;

    if (isNewThread) {
      htmlContent += `
<p style="color: #666; font-size: 14px;">
AI responses may include mistakes.
</p>`;
    }

    return this.wrapInHtml(htmlContent);
  }

  /**
   * Wrap content in simple HTML structure
   */
  private wrapInHtml(content: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px;">
${content.replace(/\n/g, '<br>')}
</body>
</html>`;
  }

  /**
   * Escape HTML characters in text content
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Send the reply email directly via EmailSendingService
   */
  async sendReplyEmail(
    parsedEmail: Omit<IncomingEmailParsed, 'attachments'>,
    replyBody: string,
    attachments?: Array<EmailAttachmentICS>,
    includeCustomizationFooter: boolean = true
  ): Promise<{ messageId?: string; success: boolean; recipientCount?: number }> {
    const startTime = Date.now();

    this.logger.info('Starting reply email composition and sending', {
      messageId: parsedEmail.messageId,
      to: parsedEmail.from,
      replyBodyLength: replyBody.length,
      attachmentCount: attachments?.length || 0,
      includeCustomizationFooter,
    });

    // Check if this is a new thread (no inReplyTo or references)
    const isNewThread =
      !parsedEmail.inReplyTo && (!parsedEmail.references || parsedEmail.references.length === 0);

    this.logger.debug('Reply email thread analysis', {
      messageId: parsedEmail.messageId,
      isNewThread,
      hasInReplyTo: !!parsedEmail.inReplyTo,
      hasReferences: !!(parsedEmail.references && parsedEmail.references.length > 0),
    });

    // Add customization footer only if requested and it's a new thread
    // Note: addCustomizationFooter handles escaping for both paths
    const finalReplyBody = this.addCustomizationFooter(
      replyBody,
      includeCustomizationFooter && isNewThread
    );

    // Compose the complete email - now returns the full raw email content
    this.logger.debug('Starting email composition', {
      messageId: parsedEmail.messageId,
      finalReplyBodyLength: finalReplyBody.length,
    });

    const compositionStartTime = Date.now();
    const rawEmailContent = await this.composeReply(parsedEmail, finalReplyBody, attachments);
    const compositionDuration = Date.now() - compositionStartTime;

    this.logger.debug('Email composition completed, sending via SES', {
      messageId: parsedEmail.messageId,
      rawEmailContentLength: rawEmailContent.length,
      compositionDurationMs: compositionDuration,
    });

    // Send the email directly via EmailSendingService
    const sendStartTime = Date.now();
    const result = await this.emailSendingService.sendRawEmail(rawEmailContent);
    const sendDuration = Date.now() - sendStartTime;

    const totalDuration = Date.now() - startTime;

    this.logger.info('Reply email sent successfully', {
      messageId: parsedEmail.messageId,
      to: parsedEmail.from,
      success: result.success,
      sesMessageId: result.messageId,
      recipientCount: result.recipientCount,
      totalDurationMs: totalDuration,
      breakdownMs: {
        composition: compositionDuration,
        sending: sendDuration,
      },
    });

    return result;
  }

  /**
   * Compose and send a complete reply email in one operation
   * This is a convenience method that combines reply composition with direct sending
   */
  async composeAndSendReply(
    parsedEmail: IncomingEmailParsed,
    replyBody: string,
    attachments?: Array<EmailAttachmentICS>
  ): Promise<{ messageId?: string; success: boolean; recipientCount?: number }> {
    return this.sendReplyEmail(parsedEmail, replyBody, attachments, true);
  }
}
