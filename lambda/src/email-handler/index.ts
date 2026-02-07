import { SQSRecord } from 'aws-lambda';
import { createCleanSQSHandler } from '../shared/lambda-utils';
import { createSimplifiedEmailHandler } from './dependencies';

// Create clean handler with factory-based dependency injection
export const handler = createCleanSQSHandler(
  async (record: SQSRecord, { logger, metrics, config }) => {
    // Create configuration for dependency injection
    const handlerConfig = {
      logger,
      metrics,
      env: {
        bucketName: config.bucketName!,
        fqdn: config.fqdn!,
        hostedZoneName: config.hostedZoneName!,
        openaiApiKey: config.openaiApiKey!,
        replyFromEmail: config.replyFromEmail!,
        scheduleGroupName: config.scheduleGroupName!,
        schedulerExecutionRoleArn: config.schedulerExecutionRoleArn!,
        targetSqsQueueArn: config.targetSqsQueueArn!,
        tableName: config.tableName!,
      },
    };

    const emailHandler = createSimplifiedEmailHandler(handlerConfig);

    await emailHandler.processRecord(record);
  },
  {
    serviceName: 'email-handler',
    requiredVars: [
      'DYNAMODB_TABLE_NAME',
      'EMAIL_BUCKET_NAME',
      'FQDN',
      'OPENAI_API_KEY',
      'REPLY_FROM_EMAIL',
      'SCHEDULE_GROUP_NAME',
      'SCHEDULER_EXECUTION_ROLE_ARN',
      'TARGET_SQS_QUEUE_ARN',
    ],
  }
);
