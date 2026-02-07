/**
 * Dependency injection for reminder processor Lambda
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { EmailRepository } from '../shared/repositories/email.repository';
import { ReplyComposerService } from '../shared/services/reply-composer.service';
import { EmailSendingService } from '../shared/services/email-sending.service';
import { SchedulerService } from '../shared/services/scheduler.service';
import { ICSAttachmentService } from '../shared/services/ics-attachment.service';
import { UserPreferencesRepository } from '../shared/repositories/user-preferences.repository';
import { UserPreferencesService } from '../shared/services/user-preferences.service';
import { NextScheduledTimeCalculator } from '../shared/services/next-scheduled-time-calculator.service';
import {
  createDynamoDBClient,
  createDynamoDBWrapper,
  createSESClient,
  createSESWrapper,
  createSchedulerClient,
  createSchedulerWrapper,
} from '../shared/aws';
import { ReminderProcessor } from './processors/reminder-processor';

interface ReminderProcessorEnvVars {
  fqdn: string;
  hostedZoneName: string;
  replyFromEmail: string;
  scheduleGroupName: string;
  schedulerExecutionRoleArn: string;
  tableName: string;
  targetSqsQueueArn: string;
}

interface ReminderProcessorDependencies {
  logger: Logger;
  metrics: Metrics;
  env: ReminderProcessorEnvVars;
}

/**
 * Create reminder processor with all dependencies
 */
export function createReminderProcessorFactory(
  deps: ReminderProcessorDependencies
): ReminderProcessor {
  const { logger, metrics, env } = deps;

  // Create AWS clients using shared factory functions
  const dynamodbClient = createDynamoDBClient({});
  const dbWrapper = createDynamoDBWrapper(dynamodbClient, {
    tableName: env.tableName,
    logger,
    metrics,
    context: { operation: 'reminder-processor' },
  });

  // Create repositories
  const emailRepository = new EmailRepository(dbWrapper, logger);

  // Create email sending services
  const sesClient = createSESClient({});
  const sesWrapper = createSESWrapper(sesClient, {
    logger,
    metrics,
    context: { operation: 'reminder-processor' },
  });

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

  const schedulerClient = createSchedulerClient({});
  const schedulerWrapper = createSchedulerWrapper(schedulerClient, {
    logger,
    metrics,
    context: { operation: 'reminder-processor' },
  });

  const schedulerService = new SchedulerService(
    schedulerWrapper,
    logger,
    env.scheduleGroupName,
    env.targetSqsQueueArn,
    env.schedulerExecutionRoleArn
  );

  const icsAttachmentService = new ICSAttachmentService(logger);

  const userPreferencesRepository = new UserPreferencesRepository(dbWrapper, logger);
  const userPreferencesService = new UserPreferencesService(userPreferencesRepository, logger);

  const nextScheduledTimeCalculator = new NextScheduledTimeCalculator(logger, metrics);

  return new ReminderProcessor(
    emailRepository,
    replyComposerService,
    schedulerService,
    icsAttachmentService,
    userPreferencesService,
    nextScheduledTimeCalculator,
    logger,
    metrics
  );
}
