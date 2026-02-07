/**
 * Document attachment processor
 * Handles document files (PDF, text files, etc.) with appropriate extraction methods
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { type TextractWrapper } from '../../../shared/aws';
import { BaseAttachmentProcessor } from './base-attachment-processor';
import { EmailAttachment } from '../../../types';

import pdfParse from 'pdf-parse-debugging-disabled';

export class DocumentAttachmentProcessor extends BaseAttachmentProcessor {
  private readonly textractWrapper: TextractWrapper;

  constructor(logger: Logger, textractWrapper: TextractWrapper) {
    super(logger);
    this.textractWrapper = textractWrapper;
  }

  canProcess(attachment: EmailAttachment): boolean {
    return attachment.type === 'document';
  }

  async processAttachment(
    attachment: EmailAttachment,
    bucketName: string,
    objectKey: string
  ): Promise<string | null> {
    const { parsed } = await this.downloadAndParseEmail(bucketName, objectKey);

    // Find the specific document attachment
    const documentAttachment = this.findAttachment(parsed, attachment);

    if (!documentAttachment || !documentAttachment.content) {
      this.logger.warn('Document attachment not found or has no content', {
        filename: attachment.filename,
        contentType: attachment.contentType,
        found: !!documentAttachment,
        hasContent: !!documentAttachment?.content,
      });
      return null;
    }

    // Handle different document types based on content type
    const contentType = attachment.contentType?.toLowerCase() || '';

    if (contentType.startsWith('text/') || contentType === 'application/csv') {
      return this.extractFromTextFile(documentAttachment.content);
    } else if (contentType === 'application/pdf') {
      return await this.extractFromPdfWithFallback(documentAttachment.content);
    } else {
      // For other document types (Word, Excel, etc.), log and return null
      return null;
    }
  }

  /**
   * Extract text from plain text files
   */
  private extractFromTextFile(content: Buffer): string {
    try {
      // Try UTF-8 first, fallback to other encodings if needed
      const textContent = content.toString('utf-8');

      return textContent;
    } catch (error) {
      this.logger.error('Failed to extract text from file', {
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }

  /**
   * Extract text from PDF using pdf-parse by default, with Textract fallback
   */
  private async extractFromPdfWithFallback(content: Buffer): Promise<string> {
    try {
      // First try pdf-parse (faster and handles more PDF formats)
      const pdfData = await pdfParse(content);

      if (pdfData.text && pdfData.text.trim().length > 0) {
        this.logger.debug('Successfully extracted PDF content with pdf-parse', {
          extractedLength: pdfData.text.length,
          pageCount: pdfData.numpages,
          info: pdfData.info,
        });

        return pdfData.text.trim();
      }

      this.logger.warn('No text content extracted from PDF using pdf-parse, trying Textract');
      return await this.extractFromPdfWithTextract(content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.warn('pdf-parse failed for PDF, attempting Textract fallback', {
        pdfParseError: errorMessage,
        pdfSizeBytes: content.length,
      });

      // Try Textract as fallback when pdf-parse fails
      return await this.extractFromPdfWithTextract(content);
    }
  }

  /**
   * Fallback PDF text extraction using AWS Textract
   * Used when pdf-parse fails or returns no content
   */
  private async extractFromPdfWithTextract(content: Buffer): Promise<string> {
    try {
      const result = await this.textractWrapper.detectDocumentText(content);

      if (!result.text || result.text.trim().length === 0) {
        this.logger.warn('No text content extracted from PDF using Textract');
        return '';
      }

      this.logger.info('Successfully extracted PDF content with Textract fallback', {
        extractedLength: result.text.length,
        lineCount: result.lineCount,
        confidence: result.confidence,
      });

      return result.text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Both pdf-parse and Textract failed for PDF extraction', {
        textractError: errorMessage,
        isUnsupportedFormat: errorMessage.includes('unsupported document format'),
        pdfSizeBytes: content.length,
      });

      return '';
    }
  }
}
