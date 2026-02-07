/**
 * Main CDK stack
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DataStack, EmailStack, SecurityStack, ComputeStack } from './stacks';

export interface MainStackProps extends cdk.StackProps {
  readonly alertEmail?: string; // Optional: Email for DMARC reports
  readonly environment: string;
  readonly fqdn: string;
  readonly hostedZoneId: string;
  readonly hostedZoneName: string;
  readonly logLevel: string;
  readonly openaiApiKey: string;
  readonly replyFromEmail: string;
  readonly scheduleGroupName: string;
}

/**
 * Main stack for infrastructure - orchestrates nested stacks.
 */
export class MainStack extends cdk.Stack {
  public readonly computeStack: ComputeStack;
  public readonly dataStack: DataStack;
  public readonly emailStack: EmailStack;
  public readonly securityStack: SecurityStack;
  private readonly deploymentRegion: string;

  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    // Validate required props
    if (!props.environment) {
      throw new Error('environment is required');
    }
    if (!props.env!.region) {
      throw new Error('Region is required in env property');
    }
    if (!props.hostedZoneId || !props.hostedZoneName) {
      throw new Error('hostedZoneId and hostedZoneName are required');
    }
    if (!props.openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    if (!props.replyFromEmail) {
      throw new Error('REPLY_FROM_EMAIL environment variable is required');
    }
    if (!props.scheduleGroupName) {
      throw new Error('scheduleGroupName is required');
    }

    // Store region for region-specific configurations
    this.deploymentRegion = props.env!.region;

    // Create nested stacks in dependency order
    this.securityStack = new SecurityStack(this, 'SecurityStack', {
      environment: props.environment,
    });

    this.dataStack = new DataStack(this, 'DataStack', {
      environment: props.environment,
      executionRole: this.securityStack.executionRole,
      scheduleGroupName: props.scheduleGroupName,
    });

    this.emailStack = new EmailStack(this, 'EmailStack', {
      alertEmail: props.alertEmail,
      emailBucket: this.dataStack.emailBucket,
      environment: props.environment,
      fqdn: props.fqdn,
      hostedZoneId: props.hostedZoneId!,
      hostedZoneName: props.hostedZoneName!,
      replyFromEmail: props.replyFromEmail,
    });

    this.computeStack = new ComputeStack(this, 'ComputeStack', {
      dynamoDbTable: this.dataStack.dynamodbTable,
      dynamoDbTableName: this.dataStack.dynamodbTable.tableName,
      emailBucket: this.dataStack.emailBucket,
      environment: props.environment,
      executionRole: this.securityStack.executionRole,
      fqdn: props.fqdn,
      hostedZoneName: props.hostedZoneName,
      incomingEmailQueue: this.dataStack.incomingEmailQueue,
      logLevel: props.logLevel,
      openaiApiKey: props.openaiApiKey,
      reminderProcessingQueue: this.dataStack.reminderProcessingQueue,
      replyFromEmail: props.replyFromEmail,
      scheduleGroupName: props.scheduleGroupName,
      schedulerExecutionRole: this.securityStack.schedulerExecutionRole,
    });

    // Outputs
    this.createOutputs();
  }

  /**
   * Create CloudFormation outputs for the main stack.
   */
  private createOutputs(): void {
    new cdk.CfnOutput(this, 'DeploymentRegion', {
      value: this.deploymentRegion,
      description: 'AWS region where resources are deployed',
    });

    new cdk.CfnOutput(this, 'StackArchitecture', {
      value: 'nested-stacks',
      description: 'Architecture pattern used for this deployment',
    });

    new cdk.CfnOutput(this, 'DataStackId', {
      value: this.dataStack.stackId,
      description: 'Data stack ID for reference',
    });

    new cdk.CfnOutput(this, 'EmailStackId', {
      value: this.emailStack.stackId,
      description: 'Email stack ID for reference',
    });

    new cdk.CfnOutput(this, 'SecurityStackId', {
      value: this.securityStack.stackId,
      description: 'Security stack ID for reference',
    });

    new cdk.CfnOutput(this, 'ComputeStackId', {
      value: this.computeStack.stackId,
      description: 'Compute stack ID for reference',
    });
  }
}
