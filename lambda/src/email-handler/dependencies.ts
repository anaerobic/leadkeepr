/**
 * Factory-based dependency creation for email processor
 * Pure TypeScript approach without DI container overhead
 */

import { AttachmentCacheRepository } from '../shared/repositories/attachment-cache.repository';
import { AttachmentContentService } from './services/attachment-content.service';
import { AttachmentProcessingService } from './services/attachment-processing.service';
import { EmailContentCleanerService } from '../shared/services/email-content-cleaner.service';
import { ThreadContentDeduplicationService } from '../shared/services/thread-content-deduplication.service';
import {
  createDynamoDBClient,
  createS3Client,
  createS3Wrapper,
  createSESClient,
  createSESWrapper,
} from '../shared/aws';
import { createDynamoDBWrapper } from '../shared/aws';
import { EmailProcessor } from './processors/email-processor';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { OpenAIService } from '../shared/services/openai.service';
import { ReplyComposerService } from '../shared/services/reply-composer.service';
import { SQSRecord } from 'aws-lambda';
import { UserPreferencesRepository } from '../shared/repositories/user-preferences.repository';
import { UserPreferencesService } from '../shared/services/user-preferences.service';
import { AttachmentTypeDetector } from '../shared/utils/attachment-type-detection';
import { EmailRetrievalService } from '../shared/services/email-retrieval.service';
import { EventParserService } from './services/event-parser.service';
import { EmailParserService } from './services/email-parser.service';
import { EmailIntentAnalyzerService } from './services/email-intent-analyzer.service';
import { EmailRepository } from '../shared/repositories/email.repository';
import { AttachmentProcessor } from './utils/attachment-processor';
import { ICSCreationFactory } from './factories/ics-creation.factory';

import { ThreadContextService } from '../shared/services/thread-context.service';
import { RegularEmailProcessor } from './processors/regular-email-processor.service';
import { EmailSendingService } from '../shared/services/email-sending.service';
import { ICSAttachmentService } from '../shared/services/ics-attachment.service';
import { SchedulerService } from '../shared/services/scheduler.service';
import { createSchedulerClient, createSchedulerWrapper } from '../shared/aws';
import { NextScheduledTimeCalculator } from '../shared/services/next-scheduled-time-calculator.service';
import { ReminderSchedulingService } from '../shared/services/reminder-scheduling.service';

/**
 * Configuration for creating email handler dependencies
 */
interface SimplifiedEmailHandlerConfig {
  logger: Logger;
  metrics: Metrics;
  env: {
    bucketName: string;
    fqdn: string;
    hostedZoneName: string;
    openaiApiKey: string;
    replyFromEmail: string;
    tableName: string;
    scheduleGroupName: string;
    schedulerExecutionRoleArn: string;
    targetSqsQueueArn: string; // Required for reminder scheduling
  };
}

/**
 * Factory function to create a email processor with all dependencies
 */
function createSimplifiedEmailProcessor(config: SimplifiedEmailHandlerConfig): EmailProcessor {
  const { logger, metrics, env } = config;

  // Create local services with explicit dependencies
  const attachmentTypeDetector = new AttachmentTypeDetector(logger);

  const s3Client = createS3Client({});
  const s3Wrapper = createS3Wrapper(s3Client, {
    bucketName: env.bucketName,
    logger,
    metrics,
    context: { operation: 'email-handler' },
  });

  const emailRetrievalService = new EmailRetrievalService(s3Wrapper, logger);

  // Create email parser-specific services
  const eventParserService = new EventParserService(logger);
  const emailParserService = new EmailParserService(logger, attachmentTypeDetector);

  const dynamodbClient = createDynamoDBClient({});
  const dynamodbWrapper = createDynamoDBWrapper(dynamodbClient, {
    tableName: env.tableName,
    logger,
    metrics,
    context: { operation: 'email-handler' },
  });

  const userPreferencesRepository = new UserPreferencesRepository(dynamodbWrapper, logger);
  const userPreferencesService = new UserPreferencesService(userPreferencesRepository, logger);
  const attachmentProcessingService = new AttachmentProcessingService(logger, env.bucketName);

  // Create attachment cache repository
  const attachmentCacheRepository = new AttachmentCacheRepository(
    dynamodbClient,
    env.tableName,
    logger,
    metrics
  );

  const attachmentContentService = new AttachmentContentService(
    logger,
    metrics,
    attachmentCacheRepository,
    attachmentProcessingService
  );

  // Create email content cleaner service
  const emailContentCleanerService = new EmailContentCleanerService(logger);

  // Create OpenAI service for the unified analyzer
  const openAIService = new OpenAIService(logger, metrics, env.openaiApiKey);

  // Create email repository for thread context
  const emailRepository = new EmailRepository(dynamodbWrapper, logger);

  // Create thread content deduplication service
  const threadDeduplicationService = new ThreadContentDeduplicationService(logger, metrics);

  // Create email intent analyzer (now uses parameters instead of inheritance for thread context)
  const emailIntentAnalyzer = new EmailIntentAnalyzerService(openAIService, logger, metrics);

  // Create supporting services
  const sesClient = createSESClient({});
  const sesWrapper = createSESWrapper(sesClient, { logger, metrics });
  const emailSendingService = new EmailSendingService(
    sesWrapper,
    logger,
    metrics,
    env.hostedZoneName
  );

  const replyComposerService = new ReplyComposerService(
    emailSendingService,
    env.replyFromEmail,
    logger,
    {
      fqdn: env.fqdn,
    }
  );

  const icsAttachmentService = new ICSAttachmentService(logger);

  // Create ICS creation utilities
  const icsFactory = new ICSCreationFactory(icsAttachmentService, logger);
  const attachmentProcessor = new AttachmentProcessor(icsFactory, logger);

  const threadContextService = new ThreadContextService(emailRepository, logger);

  const schedulerClient = createSchedulerClient({});
  const schedulerWrapper = createSchedulerWrapper(schedulerClient, {
    logger,
    metrics,
    context: { operation: 'email-handler' },
  });

  const schedulerService = new SchedulerService(
    schedulerWrapper,
    logger,
    env.scheduleGroupName,
    env.targetSqsQueueArn,
    env.schedulerExecutionRoleArn
  );

  const nextScheduledTimeCalculator = new NextScheduledTimeCalculator(logger, metrics);

  const reminderSchedulingService = new ReminderSchedulingService(
    logger,
    metrics,
    schedulerService,
    nextScheduledTimeCalculator
  );

  const regularEmailProcessor = new RegularEmailProcessor(
    {
      replyFromEmail: env.replyFromEmail,
    },
    logger,
    metrics,
    attachmentProcessor,
    emailIntentAnalyzer,
    emailRepository,
    replyComposerService,
    threadContextService,
    threadDeduplicationService,
    s3Wrapper,
    reminderSchedulingService
  );

  // Create and return the email processor
  return new EmailProcessor(
    {
      hostedZoneName: env.hostedZoneName,
      replyFromEmail: env.replyFromEmail,
    },
    logger,
    metrics,
    eventParserService,
    emailParserService,
    emailRetrievalService,
    attachmentContentService,
    emailContentCleanerService,
    regularEmailProcessor,
    userPreferencesService
  );
}

/**
 * Create a email handler for use in the Lambda function
 */
export function createSimplifiedEmailHandler(config: SimplifiedEmailHandlerConfig): {
  processRecord: (record: SQSRecord) => Promise<void>;
} {
  const emailProcessor = createSimplifiedEmailProcessor(config);

  return {
    processRecord: emailProcessor.processEmailMessage.bind(emailProcessor),
  };
}
