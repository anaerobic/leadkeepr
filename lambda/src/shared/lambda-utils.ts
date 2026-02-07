import { Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { initializePowerTools } from './powertools';

/**
 * Environment variable configuration for Lambda functions
 */
export interface LambdaEnvironmentConfig {
  bucketName?: string;
  fqdn?: string;
  hostedZoneName?: string;
  openaiApiKey?: string;
  replyFromEmail?: string;
  scheduleGroupName?: string;
  schedulerExecutionRoleArn?: string;
  serviceName: string;
  tableName?: string;
  targetSqsQueueArn?: string;
}

/**
 * Configuration for lambda initialization
 */
interface LambdaInitConfig {
  serviceName: string;
  requiredVars?: string[];
}

/**
 * Result of lambda initialization containing all necessary components
 */
interface LambdaInitResult {
  logger: Logger;
  tracer: Tracer;
  metrics: Metrics;
  config: LambdaEnvironmentConfig;
}

/**
 * Extract environment variables configuration
 */
function getEnvironmentConfig(
  serviceName: string,
  requiredVars: string[],
  logger: Logger
): LambdaEnvironmentConfig {
  const config: LambdaEnvironmentConfig = {
    serviceName,
    bucketName: process.env.EMAIL_BUCKET_NAME,
    fqdn: process.env.FQDN,
    hostedZoneName: process.env.HOSTED_ZONE_NAME,
    openaiApiKey: process.env.OPENAI_API_KEY,
    replyFromEmail: process.env.REPLY_FROM_EMAIL,
    scheduleGroupName: process.env.SCHEDULE_GROUP_NAME,
    schedulerExecutionRoleArn: process.env.SCHEDULER_EXECUTION_ROLE_ARN,
    tableName: process.env.DYNAMODB_TABLE_NAME,
    targetSqsQueueArn: process.env.TARGET_SQS_QUEUE_ARN,
  };

  // Validate required environment variables
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      logger.error(`Missing required environment variable: ${varName}`, { serviceName });
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  return config;
}

/**
 * Initialize a lambda function with PowerTools and configuration
 */
function initializeLambda(initConfig: LambdaInitConfig): LambdaInitResult {
  // Initialize PowerTools first so we have a logger
  const { logger, tracer, metrics } = initializePowerTools({
    serviceName: initConfig.serviceName,
  });

  // Get configuration and validate environment
  const config = getEnvironmentConfig(
    initConfig.serviceName,
    initConfig.requiredVars || [],
    logger
  );

  return { logger, tracer, metrics, config };
}

/**
 * Create a clean async lambda handler that handles initialization automatically
 */
export function createAsyncLambdaHandler<TEvent, TResult>(
  handlerFunction: (
    event: TEvent,
    deps: { logger: Logger; metrics: Metrics; config: LambdaEnvironmentConfig }
  ) => Promise<TResult>,
  initConfig: LambdaInitConfig
): (event: TEvent, context: Context) => Promise<TResult> {
  let initResult: LambdaInitResult | null = null;

  return async (event: TEvent, _context: Context): Promise<TResult> => {
    // Initialize on first call
    if (!initResult) {
      initResult = initializeLambda(initConfig);
    }

    const { logger, metrics, config } = initResult;

    return await handlerFunction(event, { logger, metrics, config });
  };
}

/**
 * Create a clean SQS handler with automatic initialization
 */
export function createCleanSQSHandler<TRecord>(
  recordProcessor: (
    record: TRecord,
    deps: { logger: Logger; metrics: Metrics; config: LambdaEnvironmentConfig }
  ) => Promise<void>,
  initConfig: LambdaInitConfig
): (event: { Records: TRecord[] }, context: Context) => Promise<void> {
  return createAsyncLambdaHandler(async (event: { Records: TRecord[] }, deps) => {
    for (const record of event.Records) {
      await recordProcessor(record, deps);
    }
  }, initConfig);
}

/**
 * Create a clean SNS handler with automatic initialization
 */
export function createCleanSNSHandler<TRecord>(
  recordProcessor: (
    record: TRecord,
    deps: { logger: Logger; metrics: Metrics; config: LambdaEnvironmentConfig }
  ) => Promise<void>,
  initConfig: LambdaInitConfig
): (event: { Records: TRecord[] }, context: Context) => Promise<void> {
  return createAsyncLambdaHandler(async (event: { Records: TRecord[] }, deps) => {
    for (const record of event.Records) {
      await recordProcessor(record, deps);
    }
  }, initConfig);
}
