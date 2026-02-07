/**
 * Unified Compute stack - orchestrates all compute-related nested stacks.
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { createPowertoolsLayer } from '../utils/lambda-layers';
import { EmailProcessingStack } from './email-processing-stack';
import { ReminderStack } from './reminder-stack';

export interface ComputeStackProps extends cdk.NestedStackProps {
  readonly dynamoDbTableName: string;
  readonly dynamoDbTable: dynamodb.Table;
  readonly emailBucket: s3.Bucket;
  readonly environment: string;
  readonly executionRole: iam.Role;
  readonly fqdn: string;
  readonly incomingEmailQueue: sqs.Queue;
  readonly hostedZoneName: string;
  readonly logLevel: string;
  readonly openaiApiKey: string;
  readonly reminderProcessingQueue: sqs.Queue;
  readonly replyFromEmail: string;
  readonly scheduleGroupName: string;
  readonly schedulerExecutionRole: iam.Role;
}

/**
 * Unified nested stack for all compute resources - orchestrates specialized stacks.
 */
export class ComputeStack extends cdk.NestedStack {
  // Nested stacks
  public readonly emailProcessingStack: EmailProcessingStack;
  public readonly powertoolsLayer: lambda.ILayerVersion;
  public readonly reminderStack: ReminderStack;

  public get emailHandler(): lambda.Function {
    return this.emailProcessingStack.emailHandler;
  }

  public get reminderProcessor(): lambda.Function {
    return this.reminderStack.reminderProcessor;
  }

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // Create shared PowerTools layer
    this.powertoolsLayer = createPowertoolsLayer(this);

    // Create specialized nested stacks
    this.emailProcessingStack = new EmailProcessingStack(this, 'EmailProcessing', {
      dynamoDbTableName: props.dynamoDbTableName,
      emailBucket: props.emailBucket,
      environment: props.environment,
      executionRole: props.executionRole,
      fqdn: props.fqdn,
      hostedZoneName: props.hostedZoneName,
      incomingEmailQueue: props.incomingEmailQueue,
      openaiApiKey: props.openaiApiKey,
      powertoolsLayer: this.powertoolsLayer,
      reminderProcessingQueue: props.reminderProcessingQueue,
      replyFromEmail: props.replyFromEmail,
      scheduleGroupName: props.scheduleGroupName,
      schedulerExecutionRole: props.schedulerExecutionRole,
    });

    this.reminderStack = new ReminderStack(this, 'ReminderStack', {
      environment: props.environment,
      executionRole: props.executionRole,
      emailBucket: props.emailBucket,
      dynamoDbTableName: props.dynamoDbTableName,
      fqdn: props.fqdn,
      hostedZoneName: props.hostedZoneName,
      powertoolsLayer: this.powertoolsLayer,
      reminderProcessingQueue: props.reminderProcessingQueue,
      replyFromEmail: props.replyFromEmail,
      scheduleGroupName: props.scheduleGroupName,
      schedulerExecutionRole: props.schedulerExecutionRole,
    });

    // Create unified outputs
    this.createOutputs();
  }

  /**
   * Create CloudFormation outputs.
   */
  private createOutputs(): void {
    // Email Processing Stack outputs
    new cdk.CfnOutput(this, 'EmailHandlerFunctionName', {
      value: this.emailHandler.functionName,
      description: 'Lambda function name for incoming email processing',
    });

    new cdk.CfnOutput(this, 'EmailHandlerFunctionArn', {
      value: this.emailHandler.functionArn,
      description: 'Lambda function ARN for incoming email processing',
    });

    // Reminder Processing Stack outputs
    new cdk.CfnOutput(this, 'ReminderProcessorFunctionName', {
      value: this.reminderStack.reminderProcessor.functionName,
      description: 'Lambda function name for reminder processing',
    });

    new cdk.CfnOutput(this, 'ReminderProcessorFunctionArn', {
      value: this.reminderStack.reminderProcessor.functionArn,
      description: 'Lambda function ARN for reminder processing',
    });
  }
}
