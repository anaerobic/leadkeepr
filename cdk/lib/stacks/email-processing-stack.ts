/**
 * Email Processing stack - manages email-related Lambda functions.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { createStandardLambda, StandardLambdaProps } from '../utils/lambda-factory';

export interface EmailProcessingStackProps extends cdk.NestedStackProps {
  readonly dynamoDbTableName: string;
  readonly emailBucket: s3.Bucket;
  readonly environment: string;
  readonly executionRole: iam.Role;
  readonly fqdn: string;
  readonly hostedZoneName: string;
  readonly incomingEmailQueue: sqs.Queue;
  readonly openaiApiKey: string;
  readonly powertoolsLayer: lambda.ILayerVersion;
  readonly reminderProcessingQueue: sqs.Queue;
  readonly replyFromEmail: string;
  readonly scheduleGroupName: string;
  readonly schedulerExecutionRole: iam.Role;
}

/**
 * Nested stack for email processing Lambda functions.
 */
export class EmailProcessingStack extends cdk.NestedStack {
  public readonly emailHandler: lambda.Function;

  constructor(scope: Construct, id: string, props: EmailProcessingStackProps) {
    super(scope, id, props);

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
    this.emailHandler = this.createEmailHandlerLambda(props, standardProps);

    // Create outputs
    this.createOutputs();
  }

  /**
   * Create Lambda function for processing incoming emails.
   */
  private createEmailHandlerLambda(
    props: EmailProcessingStackProps,
    standardProps: StandardLambdaProps
  ): lambda.Function {
    const lambdaFunction = createStandardLambda(
      this,
      'EmailHandler',
      {
        functionName: 'email-handler',
        handler: 'index.handler',
        codePath: 'email-handler',
        timeout: cdk.Duration.minutes(1),
        memorySize: 512,
        description: 'Process incoming emails from SQS queue',
        environment: {
          FQDN: props.fqdn,
          HOSTED_ZONE_NAME: props.hostedZoneName,
          OPENAI_API_KEY: props.openaiApiKey,
          REPLY_FROM_EMAIL: props.replyFromEmail,
          SQS_QUEUE_URL: props.incomingEmailQueue.queueUrl,
          // Optional scheduler environment variables for reminder scheduling
          ...(props.scheduleGroupName && { SCHEDULE_GROUP_NAME: props.scheduleGroupName }),
          ...(props.schedulerExecutionRole && {
            SCHEDULER_EXECUTION_ROLE_ARN: props.schedulerExecutionRole.roleArn,
          }),
          ...(props.reminderProcessingQueue && {
            TARGET_SQS_QUEUE_ARN: props.reminderProcessingQueue.queueArn,
          }),
        },
      },
      standardProps
    );

    // Add SQS trigger to the Lambda function
    lambdaFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(props.incomingEmailQueue, {
        batchSize: 1, // Process one email at a time for simplicity
        reportBatchItemFailures: true,
      })
    );

    // Grant scheduler permissions if scheduler configuration is provided
    this.grantSchedulerPermissions(
      lambdaFunction,
      props.scheduleGroupName,
      props.schedulerExecutionRole,
      props.reminderProcessingQueue
    );
    return lambdaFunction;
  }

  /**
   * Grant EventBridge Scheduler permissions to a Lambda function.
   * This allows the email handler to schedule reminders using EventBridge Scheduler.
   */
  private grantSchedulerPermissions(
    lambdaFunction: lambda.Function,
    scheduleGroupName: string,
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
          `arn:aws:scheduler:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:schedule/${scheduleGroupName}/*`,
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
    new cdk.CfnOutput(this, 'EmailHandlerFunctionName', {
      value: this.emailHandler.functionName,
      description: 'Lambda function name for incoming email processing',
    });
  }
}
