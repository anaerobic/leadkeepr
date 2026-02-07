import { Logger } from '@aws-lambda-powertools/logger';
import { convertEmailDateToIso } from '../../shared/utils/dates';
import { extractEmailClientHeaders } from '../utils/email-client-headers';
import {
  parseEmailContent,
  extractEmailAddresses,
  extractTextContent,
  processEmailAttachments,
  extractOrGenerateMessageId,
  extractThreadingHeaders,
  extractDateHeader,
} from '../../shared/utils/email-parsing';
import { AttachmentTypeDetector } from '../../shared/utils/attachment-type-detection';
import { AttachmentSignatureDetector } from '../../shared/services/attachment-signature-detector.service';
import { IncomingEmailParsed } from '../../types';

export class EmailParserService {
  private readonly signatureDetector: AttachmentSignatureDetector;

  constructor(
    private readonly logger: Logger,
    private readonly attachmentTypeDetector: AttachmentTypeDetector
  ) {
    this.signatureDetector = new AttachmentSignatureDetector(logger);
  }

  /**
   * Parse raw email content into structured metadata
   */
  async parseEmail(emailContent: string): Promise<IncomingEmailParsed> {
    const parsed = await parseEmailContent(emailContent);

    // Extract date header from raw email content
    const dateHeader = extractDateHeader(emailContent);
    const emailDate = dateHeader || new Date().toISOString();

    // Process attachments without content (optimization for incoming emails)
    const rawAttachments = processEmailAttachments(
      parsed,
      (contentType, filename) =>
        this.attachmentTypeDetector.detectAttachmentType(contentType, filename),
      false // Don't include content for incoming emails
    );

    // Filter out signature/footer attachments to avoid processing noise
    const { filteredAttachments: attachments, removedAttachments } =
      this.signatureDetector.filterSignatureAttachments(rawAttachments);

    if (removedAttachments.length > 0) {
      this.logger.info('Filtered signature attachments from email', {
        messageId: extractOrGenerateMessageId(parsed),
        totalAttachments: rawAttachments.length,
        filteredOut: removedAttachments.length,
        remaining: attachments.length,
      });
    }

    // Always extract email content since we now build complete_email_content regardless of attachments
    const emailTextContent = extractTextContent(parsed);

    const threading = extractThreadingHeaders(parsed);

    // Extract email client headers for provider detection
    const clientHeaders = extractEmailClientHeaders(emailContent);

    // Build initial metadata for timezone detection
    const preliminaryMetadata: IncomingEmailParsed = {
      messageId: extractOrGenerateMessageId(parsed),
      from: parsed.from?.text || '',
      to: extractEmailAddresses(parsed.to),
      subject: parsed.subject || '',
      emailDate: convertEmailDateToIso(emailDate),
      inReplyTo: threading.inReplyTo || '',
      references: threading.references || '',
      attachments,
      emailTextContent,
      // Include email client headers for provider detection
      xMailer: clientHeaders.xMailer,
      userAgent: clientHeaders.userAgent,
    };

    // Keep original email date - let AI handle timezone detection from headers
    // Return final metadata with original email date
    return preliminaryMetadata;
  }
}
