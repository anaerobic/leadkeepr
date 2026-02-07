/**
 * Reminder stack - manages reminder processing and scheduling.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { createStandardLambda, StandardLambdaProps } from '../utils/lambda-factory';

export interface ReminderStackProps extends cdk.NestedStackProps {
  readonly dynamoDbTableName: string;
  readonly emailBucket: s3.Bucket;
  readonly environment: string;
  readonly executionRole: iam.Role;
  readonly fqdn: string;
  readonly hostedZoneName: string;
  readonly powertoolsLayer: lambda.ILayerVersion;
  readonly reminderProcessingQueue: sqs.Queue;
  readonly replyFromEmail: string;
  readonly scheduleGroupName: string;
  readonly schedulerExecutionRole: iam.Role;
}

/**
 * Nested stack for reminder processing Lambda functions and EventBridge Scheduler.
 */
export class ReminderStack extends cdk.NestedStack {
  public readonly reminderProcessor: lambda.Function;
  private readonly scheduleGroupName: string;

  constructor(scope: Construct, id: string, props: ReminderStackProps) {
    super(scope, id, props);

    this.scheduleGroupName = props.scheduleGroupName;

    // Base environment for all lambdas
    const baseEnvironment = {
      DYNAMODB_TABLE_NAME: props.dynamoDbTableName,
      EMAIL_BUCKET_NAME: props.emailBucket.bucketName,
    };

    // Standard lambda props
    const standardProps: StandardLambdaProps = {
      environment: props.environment,
      executionRole: props.executionRole,
      powertoolsLayer: props.powertoolsLayer,
      baseEnvironment,
    };

    // Create Lambda functions
    this.reminderProcessor = this.createReminderProcessorLambda(props, standardProps);

    // Create outputs
    this.createOutputs();
  }

  /**
   * Create Lambda function for processing reminder events from EventBridge Scheduler.
   */
  private createReminderProcessorLambda(
    props: ReminderStackProps,
    standardProps: StandardLambdaProps
  ): lambda.Function {
    const lambdaFunction = createStandardLambda(
      this,
      'ReminderProcessor',
      {
        functionName: 'reminder-processor',
        handler: 'index.handler',
        codePath: 'reminder-processor',
        timeout: cdk.Duration.minutes(1),
        memorySize: 256,
        description: 'Process scheduled reminder events and generate reminder emails',
        environment: {
          EMAIL_BUCKET_NAME: props.emailBucket.bucketName,
          FQDN: props.fqdn,
          HOSTED_ZONE_NAME: props.hostedZoneName,
          REPLY_FROM_EMAIL: props.replyFromEmail,
          SCHEDULE_GROUP_NAME: props.scheduleGroupName,
          SCHEDULER_EXECUTION_ROLE_ARN: props.schedulerExecutionRole.roleArn,
          TARGET_SQS_QUEUE_ARN: props.reminderProcessingQueue.queueArn,
        },
      },
      standardProps
    );

    // Add SQS trigger to the Lambda function
    lambdaFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(props.reminderProcessingQueue, {
        batchSize: 1, // Process one reminder at a time for simplicity
        reportBatchItemFailures: true,
      })
    );

    // Grant scheduler permissions for recurring reminders
    this.grantSchedulerPermissions(
      lambdaFunction,
      props.schedulerExecutionRole,
      props.reminderProcessingQueue
    );

    return lambdaFunction;
  }

  /**
   * Grant EventBridge Scheduler permissions to a Lambda function.
   * This is a utility method that can be called from other stacks.
   */
  public grantSchedulerPermissions(
    lambdaFunction: lambda.Function,
    schedulerExecutionRole: iam.Role,
    reminderQueue: sqs.Queue
  ): void {
    // Grant EventBridge Scheduler permissions
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'scheduler:CreateSchedule',
          'scheduler:GetSchedule',
          'scheduler:UpdateSchedule',
          'scheduler:DeleteSchedule',
        ],
        resources: [
          `arn:aws:scheduler:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:schedule/${this.scheduleGroupName}/*`,
        ],
      })
    );

    // Grant SQS permissions to send messages to reminder processing queue
    reminderQueue.grantSendMessages(lambdaFunction);

    // Grant IAM pass role permissions for EventBridge Scheduler
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [schedulerExecutionRole.roleArn],
      })
    );
  }

  /**
   * Create CloudFormation outputs.
   */
  private createOutputs(): void {
    new cdk.CfnOutput(this, 'ReminderProcessorFunctionName', {
      value: this.reminderProcessor.functionName,
      description: 'Lambda function name for reminder processing',
    });

    new cdk.CfnOutput(this, 'ReminderProcessorFunctionArn', {
      value: this.reminderProcessor.functionArn,
      description: 'Lambda function ARN for reminder processing',
    });
  }
}
