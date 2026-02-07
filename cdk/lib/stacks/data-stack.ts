/**
 * Data stack - manages DynamoDB and S3 resources.
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface DataStackProps extends cdk.NestedStackProps {
  readonly environment: string;
  readonly executionRole: iam.Role;
  readonly scheduleGroupName: string;
}

/**
 * Nested stack for data layer resources and messaging.
 */
export class DataStack extends cdk.NestedStack {
  public readonly dynamodbTable: dynamodb.Table;
  public readonly emailBucket: s3.Bucket;
  public readonly incomingEmailQueue: sqs.Queue;
  public readonly incomingEmailDeadLetterQueue: sqs.Queue;
  public readonly reminderProcessingQueue: sqs.Queue;
  public readonly reminderProcessingDeadLetterQueue: sqs.Queue;
  private readonly scheduleGroupName: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.scheduleGroupName = props.scheduleGroupName;

    // S3 bucket for storing emails
    this.emailBucket = this.createEmailBucket();

    // SQS FIFO queues for email processing
    const queueResult = this.createIncomingEmailProcessingQueues();
    this.incomingEmailQueue = queueResult.queue;
    this.incomingEmailDeadLetterQueue = queueResult.deadLetterQueue;

    // Configure S3 notifications to SQS
    this.configureEmailNotifications();

    // DynamoDB table for lead data (single-table design)
    this.dynamodbTable = this.createDynamoDbTable();

    // EventBridge Scheduler Group for reminders
    this.createSchedulerGroup();

    // SQS queues for reminder processing
    const reminderQueueResult = this.createReminderProcessingQueues();
    this.reminderProcessingQueue = reminderQueueResult.queue;
    this.reminderProcessingDeadLetterQueue = reminderQueueResult.deadLetterQueue;

    // Grant permissions to execution role if provided
    if (props.executionRole) {
      this.grantPermissions(props.executionRole);
    }

    // Outputs
    this.createOutputs();
  }

  /**
   * Create DynamoDB table with single-table design.
   */
  private createDynamoDbTable(): dynamodb.Table {
    const table = new dynamodb.Table(this, 'DynamoDbTable', {
      tableName: 'user-data',
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change for production
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'gsi1Pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'gsi1Sk',
        type: dynamodb.AttributeType.STRING,
      },
    });

    return table;
  }

  /**
   * Create EventBridge Scheduler Group for reminder schedules.
   */
  private createSchedulerGroup(): void {
    new cdk.CfnResource(this, 'ReminderScheduleGroup', {
      type: 'AWS::Scheduler::ScheduleGroup',
      properties: {
        Name: this.scheduleGroupName,
      },
    });
  }

  /**
   * Create SQS queues for email processing using claim-check pattern.
   * Note: Using standard queues instead of FIFO because S3 notifications don't support FIFO queues.
   */
  private createIncomingEmailProcessingQueues(): { queue: sqs.Queue; deadLetterQueue: sqs.Queue } {
    // Create dead letter queue first
    const deadLetterQueue = new sqs.Queue(this, 'IncomingEmailDeadLetterQueue', {
      queueName: 'incoming-email-dlq',
      retentionPeriod: cdk.Duration.days(14), // Keep failed messages for 14 days
    });

    // Create main processing queue
    const queue = new sqs.Queue(this, 'IncomingEmailQueue', {
      queueName: 'incoming-email',
      visibilityTimeout: cdk.Duration.minutes(6), // Allow up to 6 minutes for processing
      retentionPeriod: cdk.Duration.days(1), // Keep messages for 1 day
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 1, // After 1 failed attempt, move to DLQ
      },
    });

    return { queue, deadLetterQueue };
  }

  /**
   * Create S3 bucket for storing incoming emails.
   */
  private createEmailBucket(): s3.Bucket {
    return new s3.Bucket(this, 'EmailBucket', {
      bucketName: `email-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change for production
      autoDeleteObjects: true, // Change for production
      versioned: false,
      lifecycleRules: [
        {
          id: 'DeleteOldEmails',
          enabled: true,
          expiration: cdk.Duration.days(90), // Keep emails for 90 days
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
  }

  /**
   * Configure S3 bucket notifications to send messages to SQS queue.
   */
  private configureEmailNotifications(): void {
    // Add S3 notification to SQS when incoming emails are stored
    this.emailBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(this.incomingEmailQueue),
      {
        prefix: 'incoming-emails/', // Only trigger for incoming emails
        // Note: SES does not add file extensions - objects are created with format: incoming-emails/{timestamp}-{messageId}
      }
    );
  }

  /**
   * Grant permissions to the provided execution role.
   */
  private grantPermissions(executionRole: iam.Role): void {
    // Grant DynamoDB permissions
    this.dynamodbTable.grantReadWriteData(executionRole);

    // Grant S3 permissions for reading and writing emails
    this.emailBucket.grantReadWrite(executionRole);

    // Grant SQS permissions to receive, delete, and get attributes for incoming email queues
    this.incomingEmailQueue.grantConsumeMessages(executionRole);
    this.incomingEmailDeadLetterQueue.grantConsumeMessages(executionRole);
  }

  /**
   * Create SQS queues for reminder processing.
   * These queues handle scheduled reminder executions triggered by EventBridge Scheduler.
   */
  private createReminderProcessingQueues(): { queue: sqs.Queue; deadLetterQueue: sqs.Queue } {
    // Create dead letter queue first
    const deadLetterQueue = new sqs.Queue(this, 'ReminderProcessingDeadLetterQueue', {
      queueName: 'reminder-processing-dlq',
      retentionPeriod: cdk.Duration.days(14), // Keep failed messages for 14 days
    });

    // Create main processing queue
    const queue = new sqs.Queue(this, 'ReminderProcessingQueue', {
      queueName: 'reminder-processing',
      visibilityTimeout: cdk.Duration.minutes(5), // Allow up to 5 minutes for reminder processing
      retentionPeriod: cdk.Duration.days(7), // Keep messages for 7 days (reminders might be delayed)
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 1, // After 1 failed attempts, move to DLQ
      },
    });

    return { queue, deadLetterQueue };
  }

  /**
   * Create CloudFormation outputs.
   */
  private createOutputs(): void {
    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: this.dynamodbTable.tableName,
      description: 'DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'DynamoDBTableArn', {
      value: this.dynamodbTable.tableArn,
      description: 'DynamoDB table ARN',
    });

    new cdk.CfnOutput(this, 'ScheduleGroup', {
      value: this.scheduleGroupName,
      description: 'EventBridge Scheduler Group for reminders',
    });

    new cdk.CfnOutput(this, 'EmailBucketName', {
      value: this.emailBucket.bucketName,
      description: 'S3 bucket name for storing emails',
    });

    new cdk.CfnOutput(this, 'EmailBucketArn', {
      value: this.emailBucket.bucketArn,
      description: 'S3 bucket ARN for storing emails',
    });

    // Output SQS queue information for incoming email processing
    new cdk.CfnOutput(this, 'IncomingEmailProcessingQueueUrl', {
      value: this.incomingEmailQueue.queueUrl,
      description: 'SQS queue URL for email processing using claim-check pattern',
    });

    new cdk.CfnOutput(this, 'IncomingEmailProcessingQueueArn', {
      value: this.incomingEmailQueue.queueArn,
      description: 'SQS queue ARN for email processing',
    });

    new cdk.CfnOutput(this, 'IncomingEmailProcessingQueueName', {
      value: this.incomingEmailQueue.queueName,
      description: 'SQS queue name for email processing',
    });

    new cdk.CfnOutput(this, 'IncomingEmailProcessingDeadLetterQueueUrl', {
      value: this.incomingEmailDeadLetterQueue.queueUrl,
      description: 'SQS dead letter queue URL for failed email processing',
    });

    new cdk.CfnOutput(this, 'IncomingEmailProcessingDeadLetterQueueArn', {
      value: this.incomingEmailDeadLetterQueue.queueArn,
      description: 'SQS dead letter queue ARN for failed email processing',
    });

    // Output SQS queue information for reminders
    new cdk.CfnOutput(this, 'ReminderEmailProcessingQueueUrl', {
      value: this.reminderProcessingQueue.queueUrl,
      description: 'SQS queue URL for reminder processing',
    });

    new cdk.CfnOutput(this, 'ReminderEmailProcessingQueueArn', {
      value: this.reminderProcessingQueue.queueArn,
      description: 'SQS queue ARN for reminder processing',
    });

    new cdk.CfnOutput(this, 'ReminderEmailProcessingQueueName', {
      value: this.reminderProcessingQueue.queueName,
      description: 'SQS queue name for reminder processing',
    });

    new cdk.CfnOutput(this, 'ReminderEmailProcessingDeadLetterQueueUrl', {
      value: this.reminderProcessingDeadLetterQueue.queueUrl,
      description: 'SQS dead letter queue URL for failed reminder processing',
    });

    new cdk.CfnOutput(this, 'ReminderEmailProcessingDeadLetterQueueArn', {
      value: this.reminderProcessingDeadLetterQueue.queueArn,
      description: 'SQS dead letter queue ARN for failed reminder processing',
    });
  }
}
