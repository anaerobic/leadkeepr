/**
 * Security stack - manages IAM roles and policies.
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SecurityStackProps extends cdk.NestedStackProps {
  readonly environment: string;
}

/**
 * Nested stack for security and IAM resources.
 */
export class SecurityStack extends cdk.NestedStack {
  public readonly executionRole: iam.Role;
  public readonly schedulerExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    // Then create Lambda execution role with reference to scheduler role
    this.executionRole = this.createExecutionRole();

    // Create scheduler execution role first
    this.schedulerExecutionRole = this.createSchedulerExecutionRole();

    // Outputs
    this.createOutputs();
  }

  /**
   * Create IAM role for Lambda functions.
   */
  private createExecutionRole(): iam.Role {
    const role = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add SES permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ses:SendEmail', 'ses:SendRawEmail', 'ses:GetSendQuota', 'ses:GetSendStatistics'],
        resources: ['*'], // SES doesn't support resource-level permissions
      })
    );

    // Add DynamoDB permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:BatchGetItem',
          'dynamodb:BatchWriteItem',
          'dynamodb:DeleteItem',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:UpdateItem',
        ],
        resources: ['*'], // DynamoDB table ARN will be scoped in deployment
      })
    );

    // Add S3 permissions for email storage
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:DeleteObject',
          's3:GetObject',
          's3:HeadBucket',
          's3:ListBucket',
          's3:PutObject',
        ],
        resources: ['*'], // S3 bucket ARN will be scoped in deployment
      })
    );

    // Add Textract permissions for attachment processing
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['textract:DetectDocumentText'],
        resources: ['*'], // Textract doesn't support resource-level permissions
      })
    );

    return role;
  }

  /**
   * Create IAM role for EventBridge Scheduler to invoke targets.
   */
  private createSchedulerExecutionRole(): iam.Role {
    const role = new iam.Role(this, 'SchedulerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });

    // Add SQS permissions for EventBridge Scheduler to send messages to reminder processing queue
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sqs:SendMessage', 'sqs:GetQueueAttributes'],
        resources: ['*'], // Will be scoped to specific reminder processing queue
      })
    );

    return role;
  }

  /**
   * Create CloudFormation outputs.
   */
  private createOutputs(): void {
    new cdk.CfnOutput(this, 'ExecutionRoleArn', {
      value: this.executionRole.roleArn,
      description: 'IAM role ARN for Lambda execution',
    });

    new cdk.CfnOutput(this, 'ExecutionRoleName', {
      value: this.executionRole.roleName,
      description: 'IAM role name for Lambda execution',
    });

    new cdk.CfnOutput(this, 'SchedulerExecutionRoleArn', {
      value: this.schedulerExecutionRole.roleArn,
      description: 'IAM role ARN for EventBridge Scheduler execution',
    });

    new cdk.CfnOutput(this, 'SchedulerExecutionRoleName', {
      value: this.schedulerExecutionRole.roleName,
      description: 'IAM role name for EventBridge Scheduler execution',
    });
  }
}
