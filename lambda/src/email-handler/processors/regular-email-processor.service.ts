/**
 * Regular Email Processor
 *
 * Handles processing of regular emails with intent analysis,
 * ICS attachment creation, and reply composition.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { ReplyComposerService } from '../../shared/services/reply-composer.service';
import { AttachmentProcessor } from '../utils/attachment-processor';
import { ThreadContextService } from '../../shared/services/thread-context.service';
import {
  IncomingEmailParsed,
  EmailIntentAnalysis,
  EmailAttachmentICS,
  EmailRecord,
  UserPreferencesRecord,
} from '../../types';
import { EmailIntentAnalyzerService } from '../services/email-intent-analyzer.service';
import { EmailRepository } from '../../shared/repositories/email.repository';
import { ThreadContentDeduplicationService } from '../../shared/services/thread-content-deduplication.service';
import { isReplyToOurEmail } from '../../shared/utils/threading';
import { S3Wrapper } from '../../shared/aws';
import { generateUserS3Key } from '../../shared/utils/s3-key-utils';
import { extractEmailAddress } from '../../shared/utils/email-addresses';
import { ReminderSchedulingService } from '../../shared/services/reminder-scheduling.service';

interface EnvVars {
  replyFromEmail: string;
}

export class RegularEmailProcessor {
  constructor(
    private readonly env: EnvVars,
    private readonly logger: Logger,
    private readonly metrics: Metrics,
    private readonly attachmentProcessor: AttachmentProcessor,
    private readonly emailIntentAnalyzer: EmailIntentAnalyzerService,
    private readonly emailRepository: EmailRepository,
    private readonly replyComposerService: ReplyComposerService,
    private readonly threadContextService: ThreadContextService,
    private readonly threadDeduplicationService: ThreadContentDeduplicationService,
    private readonly s3Wrapper: S3Wrapper,
    private readonly reminderSchedulingService: ReminderSchedulingService
  ) { }

  /**
   * Process a regular email with intent analysis and ICS attachment creation
   */
  async processRegularEmail(
    parsedEmail: IncomingEmailParsed,
    objectKey: string,
    completeContent: string,
    userPreferences: UserPreferencesRecord
  ): Promise<void> {
    const processingStartTime = Date.now();

    this.logger.info('Starting regular email processing', {
      messageId: parsedEmail.messageId,
      senderEmail: userPreferences.pk,
      hasCustomPrompt: !!userPreferences.customPrompt,
      timezone: userPreferences.timezone,
    });

    // Get user preferences - timezone is always from user's preference record
    const senderEmail = userPreferences.pk;

    // Check if we have ICS attachments that might indicate RSVP responses
    const hasICSAttachment =
      parsedEmail.attachments?.some(
        (att) =>
          att.contentType === 'text/calendar' ||
          att.contentType === 'application/ics' ||
          att.filename?.toLowerCase().endsWith('.ics')
      ) || false;

    this.logger.info('Checking for ICS attachments and retrieving thread context', {
      messageId: parsedEmail.messageId,
      hasICSAttachment,
      hasInReplyTo: !!parsedEmail.inReplyTo,
      hasReferences: !!(parsedEmail.references && parsedEmail.references.length > 0),
    });

    // Get thread context and custom prompt for analysis
    const threadContextStartTime = Date.now();
    const threadContext = await this.threadContextService.getThreadContext(parsedEmail);
    const threadContextDuration = Date.now() - threadContextStartTime;

    this.logger.info('Thread context retrieval completed', {
      messageId: parsedEmail.messageId,
      hasThreadContext: !!threadContext,
      threadEmailCount: threadContext?.emails?.length || 0,
      durationMs: threadContextDuration,
    });
    const threadContextString = threadContext
      ? this.threadContextService.createStructuredThreadContext(threadContext)
      : undefined;

    this.logger.info('Starting thread content deduplication', {
      messageId: parsedEmail.messageId,
      contentLength: completeContent.length,
      hasThreadContextString: !!threadContextString,
      threadContextLength: threadContextString?.length || 0,
    });

    // Clean content to remove duplicates before AI analysis
    const deduplicationStartTime = Date.now();
    const deduplicationResult = await this.threadDeduplicationService.cleanThreadContent(
      completeContent,
      threadContextString
    );
    const deduplicationDuration = Date.now() - deduplicationStartTime;

    this.logger.info('Thread content deduplication completed', {
      messageId: parsedEmail.messageId,
      originalLength: deduplicationResult.originalLength,
      cleanedLength: deduplicationResult.cleanedLength,
      duplicateSegmentsRemoved: deduplicationResult.duplicateSegmentsRemoved,
      reductionPercentage: deduplicationResult.reductionPercentage,
      durationMs: deduplicationDuration,
    });

    // Use cleaned content and thread context for analysis
    const cleanedContent = deduplicationResult.cleanedContent;
    const cleanedThreadContext = deduplicationResult.cleanedThreadContext || threadContextString;

    const customPrompt = userPreferences?.customPrompt;

    // Determine if this is a reply to our previous email using header analysis
    const isReply = isReplyToOurEmail(parsedEmail);

    this.logger.info('Starting AI email intent analysis', {
      messageId: parsedEmail.messageId,
      isReply,
      cleanedContentLength: cleanedContent.length,
      hasCustomPrompt: !!customPrompt,
      customPromptLength: customPrompt?.length || 0,
      hasCleanedThreadContext: !!cleanedThreadContext,
      cleanedThreadContextLength: cleanedThreadContext?.length || 0,
    });

    // Perform single analysis with timezone information, thread context, and user preferences
    const analysisStartTime = Date.now();
    const analysis = await this.emailIntentAnalyzer.analyzeEmailIntent(
      parsedEmail.subject,
      parsedEmail.emailDate,
      isReply,
      cleanedContent,
      parsedEmail.from,
      hasICSAttachment,
      cleanedThreadContext,
      {
        timezone: userPreferences?.timezone,
        customPrompt: userPreferences?.customPrompt,
        reminderStartTime: userPreferences?.reminderStartTime,
        reminderEndTime: userPreferences?.reminderEndTime,
        reminderRecurrence: userPreferences?.reminderRecurrence,
      }
    );
    const analysisDuration = Date.now() - analysisStartTime;

    this.logger.info('AI email intent analysis completed', {
      messageId: parsedEmail.messageId,
      durationMs: analysisDuration,
      isPrimarilyQuestion: analysis.isPrimarilyQuestion,
      isRSVP: analysis.isRSVP,
      isAutomaticRSVP: analysis.isAutomaticRSVP,
      hasNonRSVPContent: analysis.hasNonRSVPContent,
      reminderCount: analysis.reminders?.length || 0,
      keyInsightCount: analysis.keyInsights?.length || 0,
      confidenceScore: analysis.confidenceScore,
    });

    // Check if this is an automatic RSVP without meaningful content - skip processing if so
    if (analysis.isRSVP && analysis.isAutomaticRSVP && !analysis.hasNonRSVPContent) {
      this.logger.info('Skipping automatic RSVP without meaningful content', {
        messageId: parsedEmail.messageId,
        isRSVP: analysis.isRSVP,
        isAutomaticRSVP: analysis.isAutomaticRSVP,
        hasNonRSVPContent: analysis.hasNonRSVPContent,
      });
      return;
    }

    this.logger.info('Starting S3 email relocation to user-specific location', {
      messageId: parsedEmail.messageId,
      originalS3Key: objectKey,
      senderEmail,
    });

    // Move S3 object to user-specific location
    const s3MoveStartTime = Date.now();
    const newS3Key = await this.moveEmailToUserLocation(objectKey, senderEmail);
    const s3MoveDuration = Date.now() - s3MoveStartTime;

    this.logger.info('S3 email relocation completed', {
      messageId: parsedEmail.messageId,
      originalS3Key: objectKey,
      newS3Key,
      durationMs: s3MoveDuration,
    });

    this.logger.info('Starting email record storage in DynamoDB', {
      messageId: parsedEmail.messageId,
      newS3Key,
      cleanedContentLength: cleanedContent.length,
    });

    const dbStoreStartTime = Date.now();
    const emailRecord = await this.emailRepository.storeEmail({
      parsedEmail,
      s3Key: newS3Key,
      completeEmailContent: cleanedContent,
      emailIntentAnalysis: analysis,
    });
    const dbStoreDuration = Date.now() - dbStoreStartTime;

    this.logger.info('Email record stored in DynamoDB', {
      messageId: parsedEmail.messageId,
      threadId: emailRecord.threadId,
      gsi1Pk: emailRecord.gsi1Pk,
      durationMs: dbStoreDuration,
    });

    // Create ICS attachments if needed
    this.logger.info('Starting ICS attachment creation', {
      messageId: parsedEmail.messageId,
      reminderCount: analysis.reminders?.length || 0,
    });

    this.logger.debug('ICS attachment creation details', {
      messageId: parsedEmail.messageId,
      needsICSAttachments: this.attachmentProcessor.needsICSAttachments(analysis),
      userTimezone: userPreferences?.timezone,
      reminders: analysis.reminders?.map(event => ({
        contextualTitle: event.contextualTitle,
        dateTime: event.dateTime,
        uid: event.uid,
      })),
    });

    const icsStartTime = Date.now();
    const icsAttachments = await this.createICSAttachments(
      analysis,
      userPreferences?.timezone,
      senderEmail,
      parsedEmail.messageId
    );
    const icsDuration = Date.now() - icsStartTime;

    this.logger.info('ICS attachment creation completed', {
      messageId: parsedEmail.messageId,
      icsAttachmentCount: icsAttachments.length,
      durationMs: icsDuration,
    });

    // Compose and send the reply with proper RSVP structure
    this.logger.info('Starting reply email composition and sending', {
      messageId: parsedEmail.messageId,
      replyBodyLength: analysis.replyBody.length,
      icsAttachmentCount: icsAttachments.length,
    });

    const replyStartTime = Date.now();
    await this.replyComposerService.sendReplyEmail(parsedEmail, analysis.replyBody, icsAttachments);
    const replyDuration = Date.now() - replyStartTime;

    this.logger.info('Reply email sent successfully', {
      messageId: parsedEmail.messageId,
      durationMs: replyDuration,
    });

    // Schedule reminders if any were detected
    const schedulingStartTime = Date.now();
    await this.reminderSchedulingService.scheduleEmailReminders(emailRecord, userPreferences);
    const schedulingDuration = Date.now() - schedulingStartTime;

    const totalProcessingDuration = Date.now() - processingStartTime;

    this.logger.info('Regular email processing completed successfully', {
      messageId: parsedEmail.messageId,
      threadId: emailRecord.threadId,
      totalDurationMs: totalProcessingDuration,
      reminderSchedulingDurationMs: schedulingDuration,
      breakdownMs: {
        threadContext: threadContextDuration,
        deduplication: deduplicationDuration,
        aiAnalysis: analysisDuration,
        s3Move: s3MoveDuration,
        dbStore: dbStoreDuration,
        icsCreation: icsDuration,
        replyComposition: replyDuration,
        reminderScheduling: schedulingDuration,
      },
    });
  }



  private async createICSAttachments(
    analysis: EmailIntentAnalysis,
    userTimezone: string | undefined,
    senderEmail: string,
    messageId: string
  ): Promise<Array<EmailAttachmentICS>> {
    let attachments: Array<EmailAttachmentICS> = [];

    if (this.attachmentProcessor.needsICSAttachments(analysis)) {

      if (!userTimezone) {
        this.logger.warn(
          'No user timezone available for ICS creation!',
          {
            messageId: messageId,
            senderEmail,
            emailDate: messageId, // This should be parsedEmail.emailDate but we don't have access here
            shouldSetUserTimezone: true,
          }
        );
      }
      else { // only create ICS attachments if timezone is specified

        const attachmentOptions = {
          timezone: userTimezone,
          organizerEmail: this.env.replyFromEmail,
          attendeeEmail: senderEmail,
        };

        const attachmentsWithUids = await this.attachmentProcessor.createICSAttachments(
          analysis,
          attachmentOptions
        );

        // Convert to expected attachment format for reply composition
        attachments = attachmentsWithUids;
      }
    }

    return attachments;
  }

  /**
   * Move email from incoming location to user-specific location in S3
   */
  private async moveEmailToUserLocation(originalKey: string, senderEmail: string): Promise<string> {
    try {
      // Generate the new user-specific S3 key
      const newS3Key = generateUserS3Key(originalKey, senderEmail);

      this.logger.info('Moving email to user-specific S3 location', {
        originalKey,
        newS3Key,
        senderEmail: extractEmailAddress(senderEmail),
      });

      // Copy the object to the new location
      await this.s3Wrapper.copyObject(originalKey, newS3Key);

      // Delete the original object
      await this.s3Wrapper.deleteObject(originalKey);

      this.logger.info('Successfully moved email to user-specific location', {
        originalKey,
        newS3Key,
        senderEmail: extractEmailAddress(senderEmail),
      });

      // Track successful S3 migration
      this.metrics.addMetric('EmailS3KeyMigrationSuccess', 'Count', 1);

      return newS3Key;
    } catch (error) {
      this.logger.error('Failed to move email to user-specific location', {
        originalKey,
        senderEmail: extractEmailAddress(senderEmail),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Track failed S3 migration
      this.metrics.addMetric('EmailS3KeyMigrationFailure', 'Count', 1);

      // Return original key if move fails to ensure processing continues
      return originalKey;
    }
  }
}
