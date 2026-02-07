/**
 * Service for extracting and caching attachment content
 * Provides centralized attachment processing with caching to avoid duplicate Textract costs
 */

import { createHash } from 'crypto';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { AttachmentProcessingService } from './attachment-processing.service';
import { AttachmentCacheRepository } from '../../shared/repositories/attachment-cache.repository';
import { extractEmailAddress } from '../../shared/utils/email-addresses';
import { formatErrorMessage } from '../../shared/utils/formatting-utils';
import { isContentAlreadyIncluded } from '../../shared/utils/text-analysis';
import { EmailAttachment, IncomingEmailParsed } from '../../types';

export class AttachmentContentService {
  constructor(
    private readonly logger: Logger,
    private readonly metrics: Metrics,
    private readonly cacheRepository: AttachmentCacheRepository,
    private readonly attachmentProcessor: AttachmentProcessingService
  ) {}

  /**
   * Extract content from attachments with caching
   */
  async extractAndCacheAttachmentContent(
    attachments: EmailAttachment[],
    s3Key: string,
    emailPk: string
  ): Promise<string> {
    if (!attachments || attachments.length === 0) {
      return '';
    }

    const contentResults: string[] = [];

    for (const attachment of attachments) {
      try {
        const content = await this.extractSingleAttachmentContent(attachment, s3Key, emailPk);
        if (content) {
          contentResults.push(content);
        }
      } catch (error) {
        this.logger.error('Failed to extract content from attachment', {
          filename: attachment.filename,
          s3Key,
          emailPk,
          error: formatErrorMessage(error),
        });
        // Continue processing other attachments
        continue;
      }
    }

    const combinedContent = contentResults.join('\n');

    return combinedContent;
  }

  /**
   * Extract content from a single attachment with caching
   * Only caches in DynamoDB for Textract extractions (expensive operations)
   */
  private async extractSingleAttachmentContent(
    attachment: EmailAttachment,
    s3Key: string,
    emailPk: string
  ): Promise<string | null> {
    const extractionMethod = this.getExtractionMethod(attachment);
    const useCache = extractionMethod === 'textract';

    // Only check cache for Textract operations (expensive)
    if (useCache) {
      const cacheKey = this.generateAttachmentCacheKey(attachment);
      const cachedContent = await this.cacheRepository.getCachedContent(emailPk, cacheKey);

      if (cachedContent) {
        // Update last accessed time
        // await this.cacheRepository.updateLastAccessed(emailPk, cacheKey);

        return cachedContent.extractedText || '';
      }
    }

    // Extract content using existing attachment processor
    const startTime = Date.now();
    const extractedText = await this.attachmentProcessor.processAttachments([attachment], s3Key);
    const processingDuration = Date.now() - startTime;

    // Only cache Textract results (expensive operations)
    if (extractedText && useCache) {
      const cacheKey = this.generateAttachmentCacheKey(attachment);
      await this.cacheRepository.cacheContent({
        emailPk,
        cacheKey,
        s3Key,
        filename: attachment.filename || 'unnamed',
        contentType: attachment.contentType || 'unknown',
        contentSize: attachment.size || 0,
        extractedText,
        extractionMethod,
        processingDurationMs: processingDuration,
      });
    }

    return extractedText;
  }

  /**
   * Generate a cache key for an attachment based on content, not S3 location
   */
  private generateAttachmentCacheKey(attachment: EmailAttachment): string {
    // Create hash based on attachment content characteristics (not S3 key)
    // This allows detection of duplicate attachments across different emails
    const keyData = `${attachment.filename}|${attachment.contentType}|${attachment.size}`;
    const hash = createHash('sha256').update(keyData).digest('hex');
    return `ATTACHMENT#${hash}`;
  }

  /**
   * Determine extraction method based on attachment type
   */
  private getExtractionMethod(
    attachment: EmailAttachment
  ): 'textract' | 'email_parse' | 'text_extract' | 'manual' {
    if (attachment.type === 'image') {
      return 'textract';
    } else if (attachment.type === 'email') {
      return 'email_parse';
    } else if (attachment.type === 'document') {
      const contentType = attachment.contentType?.toLowerCase() || '';
      if (contentType.startsWith('text/') || contentType === 'application/csv') {
        return 'text_extract';
      } else if (contentType === 'application/pdf') {
        return 'textract';
      }
      return 'manual';
    }
    return 'manual';
  }

  /**
   * Gets attachment content for a parsed email, interface for processor usage
   */
  async getAttachmentContent(parsedEmail: IncomingEmailParsed, objectKey: string): Promise<string> {
    if (parsedEmail.attachments && parsedEmail.attachments.length > 0) {
      // Extract just the email address for the cache key, not the full "Name <email>" format
      const senderEmail = extractEmailAddress(parsedEmail.from);
      return await this.extractAndCacheAttachmentContent(
        parsedEmail.attachments,
        objectKey,
        senderEmail
      );
    }
    return '';
  }

  /**
   * Checks if attachment content is already included in existing content
   * Delegates to shared utility function for consistent implementation across codebase
   */
  isAttachmentContentAlreadyIncluded(existingContent: string, attachmentContent: string): boolean {
    return isContentAlreadyIncluded(existingContent, attachmentContent, 0.8);
  }
}
