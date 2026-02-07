/**
 * AWS services barrel file
 * Re-exports all AWS client factories, wrappers, and related interfaces
 */

// S3 Client and related exports
export { createS3Client, S3ClientFactory, type S3ClientConfig } from './s3-client';

// DynamoDB Client and related exports
export {
  createDynamoDBClient,
  DynamoDBClientFactory,
  type DynamoDBClientConfig,
} from './dynamodb-client';

// SES Client and related exports
export { createSESClient, SESClientFactory, type SESClientConfig } from './ses-client';
export { createSESWrapper, createSESWrapperFactory } from './ses-wrapper';

// Scheduler Client and related exports
export {
  createSchedulerClient,
  SchedulerClientFactory,
  type SchedulerClientConfig,
} from './scheduler-client';

// Textract Client and related exports
export {
  createTextractClient,
  createDefaultTextractClient,
  type TextractClientConfig,
  DEFAULT_TEXTRACT_CONFIG,
} from './textract-client';
export {
  createTextractWrapper,
  type TextractWrapper,
  type TextractResult,
} from './textract-wrapper';

// Bedrock Runtime Client and related exports
export {
  createBedrockRuntimeClient,
  BedrockRuntimeClientFactory,
  type BedrockRuntimeClientConfig,
} from './bedrock-runtime-client';
export {
  createBedrockRuntimeWrapper,
  createBedrockRuntimeWrapperFactory,
  type BedrockRuntimeOperationConfig,
  type BedrockInvokeResult,
} from './bedrock-runtime-wrapper';

// Service Wrappers and related exports
export { type AwsWrapperConfig } from './wrapper-base';
export { createS3Wrapper, type S3OperationConfig, type S3Wrapper } from './s3-wrapper';
export {
  createDynamoDBWrapper,
  type DynamoDBOperationConfig,
  type DynamoDBWrapper,
} from './dynamodb-wrapper';
export { createSchedulerWrapper, type SchedulerWrapper } from './scheduler-wrapper';
export { createAwsServiceWrappers } from './service-wrappers';
