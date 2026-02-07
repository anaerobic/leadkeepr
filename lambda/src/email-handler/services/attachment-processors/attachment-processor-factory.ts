/**
 * Attachment processor factory
 * Creates appropriate processor instances based on attachment type using Strategy pattern
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { createTextractClient, createTextractWrapper } from '../../../shared/aws';
import { AttachmentProcessor } from './attachment-processor.interface';
import { ImageAttachmentProcessor } from './image-attachment-processor';
import { EmailAttachmentProcessor } from './email-attachment-processor';
import { DocumentAttachmentProcessor } from './document-attachment-processor';
import { ICSAttachmentProcessor } from './ics-attachment-processor';
import { GenericAttachmentProcessor } from './generic-attachment-processor';
import { EmailAttachment } from '../../../types';

export class AttachmentProcessorFactory {
  private readonly processors: AttachmentProcessor[];

  constructor(logger: Logger) {
    // Create shared Textract wrapper for processors that need it
    const textractClient = createTextractClient();
    const textractWrapper = createTextractWrapper(textractClient, { logger });

    // Initialize all available processors
    this.processors = [
      new ImageAttachmentProcessor(logger, textractWrapper),
      new EmailAttachmentProcessor(logger),
      new DocumentAttachmentProcessor(logger, textractWrapper),
      new ICSAttachmentProcessor(logger),
      new GenericAttachmentProcessor(logger), // Fallback processor (always last)
    ];
  }

  /**
   * Get the appropriate processor for the given attachment
   * Uses the first processor that can handle the attachment type
   * Falls back to generic processor if no specific processor is found
   */
  getProcessor(attachment: EmailAttachment): AttachmentProcessor {
    const processor = this.processors.find((p) => p.canProcess(attachment));

    // Generic processor should always be able to handle any attachment
    // This ensures we never return undefined
    return processor || this.processors[this.processors.length - 1];
  }

  /**
   * Get all available processors (mainly for testing or introspection)
   */
  getAllProcessors(): AttachmentProcessor[] {
    return [...this.processors];
  }
}
