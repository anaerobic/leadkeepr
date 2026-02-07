import { SQSRecord } from 'aws-lambda';
import { createCleanSQSHandler } from '../shared/lambda-utils';
import { createReminderProcessorFactory } from './dependencies';
import { ReminderScheduleRequest } from '../shared/services/scheduler.service';
import { ScheduleTargetInput } from '../shared/aws/scheduler-wrapper';

export const handler = createCleanSQSHandler(
  async (record: SQSRecord, { logger, metrics, config }) => {
    // Parse the SQS message body (EventBridge payload)
    const payload: ScheduleTargetInput<ReminderScheduleRequest> = JSON.parse(record.body);

    // Validate payload structure
    if (payload.source !== 'scheduler.reminder' || !payload.detail?.reminderId) {
      logger.error('Invalid reminder payload structure', { payload });
      metrics.addMetric('InvalidReminderPayload', 'Count', 1);
      return;
    }

    // Create processor with dependencies
    const handlerConfig = {
      logger,
      metrics,
      env: {
        fqdn: config.fqdn!,
        hostedZoneName: config.hostedZoneName!,
        replyFromEmail: config.replyFromEmail!,
        scheduleGroupName: config.scheduleGroupName!,
        schedulerExecutionRoleArn: config.schedulerExecutionRoleArn!,
        tableName: config.tableName!,
        targetSqsQueueArn: config.targetSqsQueueArn!,
      },
    };

    const processor = createReminderProcessorFactory(handlerConfig);

    // Process the reminder
    await processor.processReminder(payload.detail);
  },
  {
    serviceName: 'reminder-processor',
    requiredVars: [
      'DYNAMODB_TABLE_NAME',
      'EMAIL_BUCKET_NAME',
      'FQDN',
      'REPLY_FROM_EMAIL',
      'SCHEDULE_GROUP_NAME',
      'SCHEDULER_EXECUTION_ROLE_ARN',
      'TARGET_SQS_QUEUE_ARN',
    ],
  }
);
