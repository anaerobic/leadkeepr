/**
 * Email Processor
 *
 * This version of the EmailProcessor uses a unified EmailIntentAnalyzer service
 * to process emails in a single comprehensive analysis pass, reducing the number
 * of API calls and simplifying the processing logic.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { isEmailFromDomain, extractEmailAddress } from '../../shared/utils/email-addresses';
import { AttachmentContentService } from '../services/attachment-content.service';
import { EmailRetrievalService } from '../../shared/services/email-retrieval.service';
import { EventParserService } from '../services/event-parser.service';
import { EmailParserService } from '../services/email-parser.service';
import { EmailContentCleanerService } from '../../shared/services/email-content-cleaner.service';
import { RegularEmailProcessor } from './regular-email-processor.service';
import { UserPreferencesService } from '../../shared/services/user-preferences.service';
import { IncomingEmailParsed } from '../../types';

interface EnvVars {
  hostedZoneName: string;
  replyFromEmail: string;
}

/**
 * EmailProcessor coordinator that routes emails to specialized processors
 */
export class EmailProcessor {
  constructor(
    private readonly env: EnvVars,
    private readonly logger: Logger,
    private readonly metrics: Metrics,
    private readonly eventParserService: EventParserService,
    private readonly emailParserService: EmailParserService,
    private readonly emailRetrievalService: EmailRetrievalService,
    private readonly attachmentContentService: AttachmentContentService,
    private readonly emailContentCleanerService: EmailContentCleanerService,
    private readonly regularEmailProcessor: RegularEmailProcessor,
    private readonly userPreferencesService: UserPreferencesService
  ) {}

  /**
   * Process a single email message from SQS record
   */
  async processEmailMessage(record: { body: string; messageId?: string }): Promise<void> {
    const s3EventData = this.eventParserService.parseS3Event(record);
    if (!s3EventData) return;
    const { objectKey } = s3EventData;

    const emailContent = await this.emailRetrievalService.getEmailContent(objectKey);
    const parsedEmail = await this.emailParserService.parseEmail(emailContent);

    // Skip emails from our own domain to prevent infinite loops
    if (this.env.hostedZoneName && isEmailFromDomain(parsedEmail.from, this.env.hostedZoneName)) {
      this.logger.warn('Skipping email from own domain to prevent infinite loop', {
        messageId: parsedEmail.messageId,
        from: parsedEmail.from,
        domain: this.env.hostedZoneName,
        objectKey,
      });
      return;
    }

    // Fetch user preferences - required for all email processing
    const senderEmail = extractEmailAddress(parsedEmail.from);
    const userPreferences = await this.userPreferencesService.getUserPreferences(senderEmail);

    if (!userPreferences?.emailVerified) {
      this.logger.error('Email address is not verified', {
        messageId: parsedEmail.messageId,
        from: parsedEmail.from,
        senderEmail,
        objectKey,
      });
      this.metrics.addMetric('EmailProcessingUnverifiedUser', 'Count', 1);
      throw new Error(
        `User ${senderEmail} must verify their email address before sending emails to the system`
      );
    }

    this.logger.info('Processing email from enrolled user', {
      messageId: parsedEmail.messageId,
      senderEmail,
      hasPreferences: true,
      timezone: userPreferences.timezone,
      customPrompt: !!userPreferences.customPrompt,
    });

    // Get attachment content for complete analysis
    this.logger.info('Starting attachment content retrieval', {
      messageId: parsedEmail.messageId,
      attachmentCount: parsedEmail.attachments?.length || 0,
    });

    const attachmentContent = await this.attachmentContentService.getAttachmentContent(
      parsedEmail,
      objectKey
    );

    this.logger.info('Attachment content retrieved, building complete email content', {
      messageId: parsedEmail.messageId,
      attachmentContentLength: attachmentContent.length,
    });

    const completeContent = await this.buildCompleteEmailContent(parsedEmail, attachmentContent);

    this.logger.info('Complete email content built, starting regular email processing', {
      messageId: parsedEmail.messageId,
      completeContentLength: completeContent.length,
    });

    // Process all emails as regular emails
    await this.regularEmailProcessor.processRegularEmail(
      parsedEmail,
      objectKey,
      completeContent,
      userPreferences
    );
  }

  /**
   * Build complete email content by combining existing content with attachment content
   * Implements smart deduplication and content cleaning to avoid redundant content and noise
   */
  private async buildCompleteEmailContent(
    eventDetail: IncomingEmailParsed,
    attachmentContent: string
  ): Promise<string> {
    // Start with the initial email content that was built during parsing
    let content = eventDetail.emailTextContent || '';

    // Only append attachment content if it's not already included and has meaningful content
    if (attachmentContent.trim()) {
      // Check if attachment content is already included in the existing content
      const isAlreadyIncluded = this.attachmentContentService.isAttachmentContentAlreadyIncluded(
        content,
        attachmentContent
      );

      if (!isAlreadyIncluded) {
        // Add spacing if we already have content
        if (content.trim()) {
          content += '\n\n';
        }
        content += attachmentContent;
      }
    }

    const rawContent = content.trim();

    // Apply intelligent content cleaning to remove noise while preserving conversation and metadata
    try {
      const cleaningResult = await this.emailContentCleanerService.cleanEmailContent(rawContent);

      // Log cleaning results for debugging
      this.logger.info('Email content cleaning results', {
        messageId: eventDetail.messageId,
        originalLength: rawContent.length,
        cleanedLength: cleaningResult.cleanedContent.length,
        confidenceScore: cleaningResult.confidenceScore,
        removedSections: cleaningResult.removedSections.length,
        reductionPercentage:
          ((rawContent.length - cleaningResult.cleanedContent.length) / rawContent.length) * 100,
        removedSectionsPreviews: cleaningResult.removedSections.slice(0, 3), // Show first 3 removed sections
        preservedMetadataCount: cleaningResult.preservedMetadata.length,
        preservedMetadataPreviews: cleaningResult.preservedMetadata.slice(0, 3), // Show speaker identification info
        willUseCleanedContent: cleaningResult.confidenceScore >= 0.2,
      });

      this.logger.debug('Detailed email content cleaning analysis', {
        messageId: eventDetail.messageId,
        rawContentPreview: rawContent.substring(0, 200) + '...',
        cleanedContentPreview: cleaningResult.cleanedContent.substring(0, 200) + '...',
        allRemovedSections: cleaningResult.removedSections,
        allPreservedMetadata: cleaningResult.preservedMetadata,
        confidenceFactors: {
          confidenceScore: cleaningResult.confidenceScore,
          willUseCleaned: cleaningResult.confidenceScore >= 0.2,
          reductionSignificant: ((rawContent.length - cleaningResult.cleanedContent.length) / rawContent.length) > 0.1,
        },
      });

      // Use cleaned content if confidence is reasonable - aggressive threshold with enhanced patterns
      const finalContent =
        cleaningResult.confidenceScore >= 0.2 ? cleaningResult.cleanedContent : rawContent;

      return finalContent;
    } catch (error) {
      this.logger.warn('Content cleaning failed, using original content', {
        messageId: eventDetail.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return rawContent;
    }
  }
}
