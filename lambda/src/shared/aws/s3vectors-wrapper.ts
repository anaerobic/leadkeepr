/**
 * S3 Vectors operations wrapper with consistent error handling and metrics
 *
 * Note: S3 Vectors is in preview - using custom API calls until TypeScript SDK is available
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { S3Client } from '@aws-sdk/client-s3';
import {
  AwsWrapperConfig,
  createAwsOperationExecutor,
  createAwsMetricsHelper,
} from './wrapper-base';
import { createS3VectorsHttpClient } from './aws-http-client';

export interface S3VectorsOperationConfig extends AwsWrapperConfig {
  vectorBucketName: string;
}

/**
 * Vector document structure for S3 Vectors
 */
export interface VectorDocument {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

/**
 * Vector index creation configuration
 */
export interface VectorIndexConfig {
  indexName: string;
  dataType: 'float32' | 'float64';
  dimension: number;
  distanceMetric: 'cosine' | 'euclidean' | 'dotproduct';
}

/**
 * Vector query configuration
 */
export interface VectorQueryConfig {
  indexName: string;
  queryVector: number[];
  topK?: number;
  includeMetadata?: boolean;
  metadataFilter?: Record<string, unknown>;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * S3 Vectors operations wrapper
 *
 * Note: This implementation uses placeholder methods until S3 Vectors TypeScript SDK is available
 * For production use, these would call the actual S3 Vectors API endpoints
 */
export function createS3VectorsWrapper(client: S3Client, config: S3VectorsOperationConfig) {
  const executeS3VectorsOperation = createAwsOperationExecutor('S3Vectors', config);
  const standardMetrics = createAwsMetricsHelper(config);
  const region = process.env.AWS_REGION || 'us-west-2';
  const httpClient = createS3VectorsHttpClient(region, config);

  return {
    /**
     * Create a vector index for a specific user
     */
    async createIndex(indexConfig: VectorIndexConfig): Promise<void> {
      const result = await executeS3VectorsOperation(
        async () => {
          config.logger.debug('Creating vector index via S3 Vectors API', {
            vectorBucketName: config.vectorBucketName,
            indexName: indexConfig.indexName,
            dimension: indexConfig.dimension,
            distanceMetric: indexConfig.distanceMetric,
          });

          try {
            const response = await httpClient.makeJsonRequest({
              method: 'POST',
              path: '/CreateIndex',
              data: {
                vectorBucketName: config.vectorBucketName,
                indexName: indexConfig.indexName,
                dataType: indexConfig.dataType,
                dimension: indexConfig.dimension,
                distanceMetric: indexConfig.distanceMetric,
              },
            });

            config.logger.debug('Successfully created S3 Vectors index', {
              indexName: indexConfig.indexName,
              dimension: indexConfig.dimension,
              distanceMetric: indexConfig.distanceMetric,
              response: response,
            });
            standardMetrics?.addCount('S3VectorsCreateIndex', 1);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Check if index already exists (409 conflict)
            if (errorMessage.includes('HTTP 409')) {
              config.logger.debug('Index already exists, continuing', {
                indexName: indexConfig.indexName,
                error: errorMessage,
              });
              standardMetrics?.addCount('S3VectorsCreateIndexAlreadyExists', 1);
              return; // Don't throw error for existing index
            }

            config.logger.error('Failed to create S3 Vectors index', {
              error: errorMessage,
              indexName: indexConfig.indexName,
              vectorBucketName: config.vectorBucketName,
            });

            throw new Error(`Failed to create S3 Vectors index: ${errorMessage}`);
          }
        },
        'CreateIndex',
        {
          vectorBucketName: config.vectorBucketName,
          indexName: indexConfig.indexName,
          dimension: indexConfig.dimension,
        }
      );

      if (!result.success) {
        throw result.error;
      }
    },

    /**
     * Store vector in the specified index
     */
    async putVector(indexName: string, vectorDoc: VectorDocument): Promise<void> {
      const result = await executeS3VectorsOperation(
        async () => {
          config.logger.debug('Storing vector via S3 Vectors API', {
            vectorBucketName: config.vectorBucketName,
            indexName,
            vectorId: vectorDoc.id,
            vectorDimension: vectorDoc.vector.length,
            metadataKeys: Object.keys(vectorDoc.metadata),
          });

          try {
            const response = await httpClient.makeJsonRequest({
              method: 'POST',
              path: '/PutVectors',
              data: {
                vectorBucketName: config.vectorBucketName,
                indexName: indexName,
                vectors: [
                  {
                    key: vectorDoc.id,
                    data: {
                      float32: vectorDoc.vector,
                    },
                    metadata: vectorDoc.metadata,
                  },
                ],
              },
            });

            config.logger.debug('Successfully stored vector in S3 Vectors', {
              vectorId: vectorDoc.id,
              indexName,
              vectorDimension: vectorDoc.vector.length,
              metadataKeys: Object.keys(vectorDoc.metadata),
              response: response,
            });

            standardMetrics?.addCount('S3VectorsPutVector', 1);
            standardMetrics?.addSize('S3VectorsDimension', vectorDoc.vector.length);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            config.logger.error('Failed to store vector in S3 Vectors', {
              error: errorMessage,
              vectorId: vectorDoc.id,
              indexName,
              vectorBucketName: config.vectorBucketName,
            });

            throw new Error(`Failed to store vector in S3 Vectors: ${errorMessage}`);
          }
        },
        'PutVector',
        {
          vectorBucketName: config.vectorBucketName,
          indexName,
          vectorId: vectorDoc.id,
          vectorDimension: vectorDoc.vector.length,
        }
      );

      if (!result.success) {
        throw result.error;
      }
    },

    /**
     * Query vectors for similarity search
     */
    async queryVectors(queryConfig: VectorQueryConfig): Promise<VectorSearchResult[]> {
      const result = await executeS3VectorsOperation(
        async () => {
          config.logger.debug('Querying vectors via S3 Vectors API', {
            vectorBucketName: config.vectorBucketName,
            indexName: queryConfig.indexName,
            queryVectorDimension: queryConfig.queryVector.length,
            topK: queryConfig.topK || 10,
            hasMetadataFilter: !!queryConfig.metadataFilter,
          });

          try {
            const response = await httpClient.makeJsonRequest({
              method: 'POST',
              path: '/QueryVectors',
              data: {
                vectorBucketName: config.vectorBucketName,
                indexName: queryConfig.indexName,
                queryVector: {
                  float32: queryConfig.queryVector,
                },
                topK: queryConfig.topK || 10,
                returnMetadata: queryConfig.includeMetadata !== false,
                ...(queryConfig.metadataFilter && { filter: queryConfig.metadataFilter }),
              },
            });

            // Transform response to our interface
            const searchResults: VectorSearchResult[] = (
              response.vectors ||
              response.results ||
              response.matches ||
              []
            ).map(
              (vector: {
                key?: string;
                id: string;
                score?: number;
                distance?: number;
                metadata?: Record<string, unknown>;
              }) => ({
                id: vector.key || vector.id,
                score: vector.score || vector.distance,
                metadata: vector.metadata || {},
              })
            );

            config.logger.debug('Successfully queried vectors from S3 Vectors', {
              indexName: queryConfig.indexName,
              queryVectorDimension: queryConfig.queryVector.length,
              topK: queryConfig.topK || 10,
              resultsFound: searchResults.length,
              hasMetadataFilter: !!queryConfig.metadataFilter,
            });

            standardMetrics?.addCount('S3VectorsQueryVectors', 1);
            standardMetrics?.addSize('S3VectorsQueryDimension', queryConfig.queryVector.length);
            standardMetrics?.addCount('S3VectorsQueryResults', searchResults.length);

            return searchResults;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            config.logger.error('Failed to query vectors from S3 Vectors', {
              error: errorMessage,
              indexName: queryConfig.indexName,
              topK: queryConfig.topK || 10,
              vectorBucketName: config.vectorBucketName,
            });

            throw new Error(`Failed to query vectors from S3 Vectors: ${errorMessage}`);
          }
        },
        'QueryVectors',
        {
          vectorBucketName: config.vectorBucketName,
          indexName: queryConfig.indexName,
          queryVectorDimension: queryConfig.queryVector.length,
          topK: queryConfig.topK || 10,
        }
      );

      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    },

    /**
     * Check if index exists
     */
    async indexExists(indexName: string): Promise<boolean> {
      const result = await executeS3VectorsOperation(
        async () => {
          config.logger.debug('Checking if index exists', {
            vectorBucketName: config.vectorBucketName,
            indexName,
          });

          try {
            const response = await httpClient.makeJsonRequest({
              method: 'POST',
              path: '/ListIndexes',
              data: {
                vectorBucketName: config.vectorBucketName,
              },
            });

            // Check if index exists in the response
            const exists =
              response.indexes?.some(
                (index: { indexName: string }) => index.indexName === indexName
              ) || false;

            config.logger.debug('Index existence check completed', {
              indexName,
              exists,
              totalIndexes: response.indexes?.length || 0,
              foundIndexes:
                response.indexes?.map((idx: { indexName: string }) => idx.indexName) || [],
            });

            standardMetrics?.addCount('S3VectorsIndexExists', 1);

            return exists;
          } catch (error) {
            config.logger.warn('Error checking index existence via S3 Vectors API', {
              error: error instanceof Error ? error.message : String(error),
              indexName,
              note: 'Falling back to assume index does not exist',
            });

            // If API call fails, assume index doesn't exist to trigger creation attempt
            return false;
          }
        },
        'IndexExists',
        {
          vectorBucketName: config.vectorBucketName,
          indexName,
        }
      );

      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    },
  };
}

/**
 * Factory function for S3 Vectors wrapper creation with bucket pre-configured
 */
export function createS3VectorsWrapperFactory(client: S3Client, baseConfig: AwsWrapperConfig) {
  return (vectorBucketName: string) =>
    createS3VectorsWrapper(client, { ...baseConfig, vectorBucketName });
}
