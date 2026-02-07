/**
 * Email attachment processor
 * Handles email files (.eml, .msg) by parsing and extracting their content
 */

import { simpleParser } from 'mailparser';
import { Logger } from '@aws-lambda-powertools/logger';
import { BaseAttachmentProcessor } from './base-attachment-processor';
import { EmailAttachment } from '../../../types';

export class EmailAttachmentProcessor extends BaseAttachmentProcessor {
  constructor(logger: Logger) {
    super(logger);
  }

  canProcess(attachment: EmailAttachment): boolean {
    return attachment.type === 'email';
  }

  async processAttachment(
    attachment: EmailAttachment,
    bucketName: string,
    objectKey: string
  ): Promise<string | null> {
    const { parsed } = await this.downloadAndParseEmail(bucketName, objectKey);

    // Find the specific email attachment
    const emailAttachment = this.findAttachment(parsed, attachment);

    if (!emailAttachment || !emailAttachment.content) {
      this.logger.warn('Email attachment not found or has no content', {
        filename: attachment.filename,
        contentType: attachment.contentType,
        found: !!emailAttachment,
        hasContent: !!emailAttachment?.content,
      });
      return null;
    }

    return await this.parseAttachedEmail(emailAttachment.content);
  }

  /**
   * Parse the attached email and extract its text content
   */
  private async parseAttachedEmail(content: Buffer): Promise<string | null> {
    try {
      // Parse the attachment as an email
      const attachedEmailContent = content.toString();
      const attachedEmail = await simpleParser(attachedEmailContent);

      let extractedContent = '';

      if (attachedEmail.subject) {
        extractedContent += `Subject: ${attachedEmail.subject}\n`;
      }

      if (attachedEmail.text) {
        extractedContent += attachedEmail.text;
      }

      return extractedContent || null;
    } catch (error) {
      this.logger.error('Failed to parse attached email', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
