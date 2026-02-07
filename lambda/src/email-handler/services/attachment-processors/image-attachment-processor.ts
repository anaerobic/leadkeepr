/**
 * Image attachment processor
 * Handles image files using AWS Textract for text extraction
 */

import { Logger } from '@aws-lambda-powertools/logger';

import { type TextractWrapper } from '../../../shared/aws';
import { BaseAttachmentProcessor } from './base-attachment-processor';
import { EmailAttachment } from '../../../types';

export class ImageAttachmentProcessor extends BaseAttachmentProcessor {
  private readonly textractWrapper: TextractWrapper;

  constructor(logger: Logger, textractWrapper: TextractWrapper) {
    super(logger);
    this.textractWrapper = textractWrapper;
  }

  canProcess(attachment: EmailAttachment): boolean {
    return attachment.type === 'image';
  }

  async processAttachment(
    attachment: EmailAttachment,
    bucketName: string,
    objectKey: string
  ): Promise<string | null> {
    const { parsed } = await this.downloadAndParseEmail(bucketName, objectKey);

    // Find the specific image attachment
    const imageAttachment = this.findAttachment(parsed, attachment);

    if (!imageAttachment || !imageAttachment.content) {
      this.logger.warn('Image attachment not found or has no content', {
        filename: attachment.filename,
        contentType: attachment.contentType,
        found: !!imageAttachment,
        hasContent: !!imageAttachment?.content,
      });
      return null;
    }

    return await this.extractTextWithTextract(imageAttachment.content);
  }

  /**
   * Extract text from image using AWS Textract
   */
  private async extractTextWithTextract(content: Buffer): Promise<string | null> {
    try {
      const result = await this.textractWrapper.detectImageText(content);

      if (!result.text || result.text.trim().length === 0) {
        this.logger.warn('No text content extracted from image using Textract');
        return null;
      }

      this.logger.debug('Successfully extracted text from image', {
        extractedLength: result.text.length,
        lineCount: result.lineCount,
        confidence: result.confidence,
      });

      return result.text;
    } catch (error) {
      this.logger.error('Failed to extract text from image using Textract', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
