/**
 * Reusable patterns for creating Lambda functions in the Compute stack
 * Standardizes lambda creation with consistent configurations
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { AWS_CONFIG, getEnvironmentConfig } from '../config/constants';

export interface LambdaConfig {
  functionName: string;
  handler: string;
  codePath: string;
  timeout?: cdk.Duration;
  memorySize?: number;
  description?: string;
  environment?: Record<string, string>;
  requiredVars?: string[];
}

export interface StandardLambdaProps {
  environment: string;
  executionRole: iam.Role;
  powertoolsLayer: lambda.ILayerVersion;
  baseEnvironment: Record<string, string>;
}

/**
 * Create a standardized Lambda function with consistent configuration
 */
export function createStandardLambda(
  scope: Construct,
  id: string,
  config: LambdaConfig,
  props: StandardLambdaProps
): lambda.Function {
  const environment = props.environment;
  const envConfig = getEnvironmentConfig(environment);

  // Create a log group with explicit retention settings
  const logGroup = new logs.LogGroup(scope, `${id}LogGroup`, {
    logGroupName: `/aws/lambda/${config.functionName}`,
    retention: logs.RetentionDays.ONE_DAY,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  return new lambda.Function(scope, id, {
    functionName: config.functionName,
    runtime: lambda.Runtime.NODEJS_20_X,
    handler: config.handler,
    code: lambda.Code.fromAsset(`../lambda/dist/${config.codePath}`),
    role: props.executionRole,
    timeout: config.timeout || cdk.Duration.minutes(AWS_CONFIG.DEFAULTS.LAMBDA_TIMEOUT_MINUTES),
    memorySize: config.memorySize || envConfig.memorySize,
    layers: [props.powertoolsLayer],
    tracing: lambda.Tracing.ACTIVE,
    logGroup: logGroup,
    description: config.description,
    environment: {
      ...props.baseEnvironment,
      ...config.environment,
      POWERTOOLS_SERVICE_NAME: config.functionName,
      POWERTOOLS_LOG_LEVEL: envConfig.logLevel,
      POWERTOOLS_LOGGER_SAMPLE_RATE: envConfig.sampleRate,
      POWERTOOLS_METRICS_NAMESPACE: 'lambda',
      POWERTOOLS_TRACER_CAPTURE_RESPONSE: 'true',
      POWERTOOLS_TRACER_CAPTURE_ERROR: 'true',
      NODE_OPTIONS: '--enable-source-maps',
    },
  });
}
