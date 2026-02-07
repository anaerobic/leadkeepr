import { Logger } from '@aws-lambda-powertools/logger';
import { AttachmentProcessorFactory } from './attachment-processors/attachment-processor-factory';
import { EmailAttachment } from '../../types';

/**
 * Service for processing email attachments and extracting their content
 * Refactored to use Strategy pattern with specialized processors
 */
export class AttachmentProcessingService {
  private readonly processorFactory: AttachmentProcessorFactory;

  constructor(
    private readonly logger: Logger,
    private readonly bucketName: string
  ) {
    this.processorFactory = new AttachmentProcessorFactory(logger);
  }

  /**
   * Process attachments and extract their text content
   * Uses Strategy pattern to delegate processing to specialized processors
   */
  async processAttachments(attachments: EmailAttachment[], objectKey: string): Promise<string> {
    if (!attachments || attachments.length === 0) {
      return '';
    }

    const results: string[] = [];

    for (const attachment of attachments) {
      try {
        // Get the appropriate processor for this attachment type
        const processor = this.processorFactory.getProcessor(attachment);

        // Process the attachment using the specialized processor
        const content = await processor.processAttachment(attachment, this.bucketName, objectKey);

        if (content) {
          results.push(
            `\n--- Content from attachment: ${attachment.filename || 'unnamed'} ---\n${content}`
          );
        } else {
          this.logger.warn('No content extracted from attachment', {
            filename: attachment.filename,
            type: attachment.type,
          });
        }
      } catch (error) {
        this.logger.error('Failed to process attachment', {
          filename: attachment.filename,
          error: error instanceof Error ? error.message : String(error),
        });
        // Skip failed attachments silently
        continue;
      }
    }

    const totalContent = results.join('\n');

    return totalContent;
  }
}
