/**
 * Factory functions for creating AWS service wrappers with shared configuration
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AwsWrapperConfig } from './wrapper-base';
import { createS3Wrapper } from './s3-wrapper';
import { createDynamoDBWrapper } from './dynamodb-wrapper';

// Re-export wrapper functions
export { createS3Wrapper, createDynamoDBWrapper };

/**
 * Create all AWS service wrappers with shared configuration
 */
export function createAwsServiceWrappers(
  clients: {
    s3: S3Client;
    dynamodb: DynamoDBDocumentClient;
  },
  baseConfig: AwsWrapperConfig
) {
  return {
    createS3Wrapper: (bucketName: string) =>
      createS3Wrapper(clients.s3, { ...baseConfig, bucketName }),

    createDynamoDBWrapper: (tableName: string) =>
      createDynamoDBWrapper(clients.dynamodb, { ...baseConfig, tableName }),
  };
}
