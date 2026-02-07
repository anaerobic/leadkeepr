/**
 * Standardized S3 operations wrapper with consistent error handling and metrics
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import {
  AwsWrapperConfig,
  createAwsOperationExecutor,
  createAwsMetricsHelper,
} from './wrapper-base';

export interface S3OperationConfig extends AwsWrapperConfig {
  bucketName: string;
}

/**
 * Type definition for S3 wrapper interface
 */
export type S3Wrapper = ReturnType<typeof createS3Wrapper>;

/**
 * Standardized S3 operations wrapper
 */
export function createS3Wrapper(client: S3Client, config: S3OperationConfig) {
  const executeS3Operation = createAwsOperationExecutor('S3', config);
  const standardMetrics = createAwsMetricsHelper(config);

  return {
    async getObject(key: string): Promise<string> {
      const result = await executeS3Operation(
        async () => {
          const command = new GetObjectCommand({
            Bucket: config.bucketName,
            Key: key,
          });
          const response = await client.send(command);
          const body = (await response.Body?.transformToString()) || '';

          standardMetrics?.addSize('S3GetObject', body.length);
          return body;
        },
        'GetObject',
        { objectKey: key, bucketName: config.bucketName }
      );

      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    },

    async putObject(
      key: string,
      body: string | Buffer,
      metadata?: Record<string, string>
    ): Promise<void> {
      const result = await executeS3Operation(
        async () => {
          const command = new PutObjectCommand({
            Bucket: config.bucketName,
            Key: key,
            Body: body,
            Metadata: metadata,
          });
          await client.send(command);

          const size = typeof body === 'string' ? body.length : body.byteLength;
          standardMetrics?.addSize('S3PutObject', size);
        },
        'PutObject',
        { objectKey: key, bucketName: config.bucketName, hasMetadata: !!metadata }
      );

      if (!result.success) {
        throw result.error;
      }
    },

    async deleteObject(key: string): Promise<void> {
      const result = await executeS3Operation(
        async () => {
          const command = new DeleteObjectCommand({
            Bucket: config.bucketName,
            Key: key,
          });
          await client.send(command);
        },
        'DeleteObject',
        { objectKey: key, bucketName: config.bucketName }
      );

      if (!result.success) {
        throw result.error;
      }
    },

    async listObjects(prefix?: string, maxKeys?: number): Promise<string[]> {
      const result = await executeS3Operation(
        async () => {
          const command = new ListObjectsV2Command({
            Bucket: config.bucketName,
            Prefix: prefix,
            MaxKeys: maxKeys,
          });
          const response = await client.send(command);
          const keys = response.Contents?.map((obj) => obj.Key!).filter(Boolean) || [];

          standardMetrics?.addCount('S3ListObjects', keys.length);
          return keys;
        },
        'ListObjects',
        { prefix, maxKeys, bucketName: config.bucketName }
      );

      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    },

    async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
      const result = await executeS3Operation(
        async () => {
          const command = new CopyObjectCommand({
            Bucket: config.bucketName,
            CopySource: `${config.bucketName}/${sourceKey}`,
            Key: destinationKey,
          });
          await client.send(command);

          standardMetrics?.addCount('S3CopyObject', 1);
        },
        'CopyObject',
        { sourceKey, destinationKey, bucketName: config.bucketName }
      );

      if (!result.success) {
        throw result.error;
      }
    },
  };
}

/**
 * Factory function for S3 wrapper creation with bucket pre-configured
 */
export function createS3WrapperFactory(client: S3Client, baseConfig: AwsWrapperConfig) {
  return (bucketName: string) => createS3Wrapper(client, { ...baseConfig, bucketName });
}
