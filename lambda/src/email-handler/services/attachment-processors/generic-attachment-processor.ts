/**
 * Generic attachment processor - fallback handler for unknown or unsupported attachment types
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { BaseAttachmentProcessor } from './base-attachment-processor';
import { EmailAttachment } from '../../../types';

export class GenericAttachmentProcessor extends BaseAttachmentProcessor {
  constructor(logger: Logger) {
    super(logger);
  }

  canProcess(_attachment: EmailAttachment): boolean {
    // Generic processor can handle any attachment as a fallback
    return true;
  }

  async processAttachment(attachment: EmailAttachment): Promise<string | null> {
    // For unknown attachments, we return null to indicate no text content could be extracted
    this.logger.warn('No specific processor available for attachment type', {
      filename: attachment.filename,
      contentType: attachment.contentType,
      type: attachment.type,
    });

    return null;
  }
}
