/**
 * Repository for attachment cache records in DynamoDB
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { createDynamoDBWrapper } from '../aws';
import { getCurrentTimestamp } from '../utils/dates';
import { DynamoDBItem } from '../../types';

/**
 * Attachment cache types for DynamoDB storage
 */

interface AttachmentCacheRecord extends DynamoDBItem {
  // Primary keys
  pk: string; // sender email address
  sk: string; // ATTACHMENT#{hash}

  // GSI keys for lookup
  gsi1Pk?: string; // reserved for future use
  gsi1Sk?: string; // reserved for future use

  // Cache metadata
  hash: string; // SHA-256 hash of attachment content
  s3Key: string; // Original email S3 key
  filename: string;
  contentType: string;
  contentSize: number;

  // Extracted content
  extractedText: string;
  extractionMethod: 'textract' | 'email_parse' | 'text_extract' | 'manual';
  extraction_confidence?: number;

  // Timestamps
  createdAt: string;
  lastAccessed: string;

  // Processing metadata
  textract_job_id?: string;
  processingDurationMs?: number;
  processing_cost_estimate?: number;
}

interface CacheContentParams {
  emailPk: string;
  cacheKey: string;
  s3Key: string;
  filename: string;
  contentType: string;
  contentSize: number;
  extractedText: string;
  extractionMethod: 'textract' | 'email_parse' | 'text_extract' | 'manual';
  processingDurationMs?: number;
}

export class AttachmentCacheRepository {
  private readonly dbWrapper;

  constructor(
    private readonly dynamoDBClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger,
    private readonly metrics: Metrics
  ) {
    this.dbWrapper = createDynamoDBWrapper(this.dynamoDBClient, {
      tableName: this.tableName,
      logger: this.logger,
      metrics: this.metrics,
      context: { repositoryType: 'AttachmentCache' },
    });
  }

  /**
   * Get cached content by cache key
   */
  async getCachedContent(emailPk: string, cacheKey: string): Promise<AttachmentCacheRecord | null> {
    try {
      const result = await this.dbWrapper.getItem<AttachmentCacheRecord>({
        pk: emailPk,
        sk: cacheKey,
      });

      if (result) {
        // Update last accessed time asynchronously
        this.updateLastAccessed(emailPk, cacheKey).catch((error) => {
          this.logger.warn('Failed to update last accessed time', {
            emailPk,
            cacheKey,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to get cached content', {
        emailPk,
        cacheKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Cache extracted content
   */
  async cacheContent(params: CacheContentParams): Promise<void> {
    const now = getCurrentTimestamp();

    const record: AttachmentCacheRecord = {
      pk: params.emailPk,
      sk: params.cacheKey,
      // Cache metadata
      hash: params.cacheKey.replace('ATTACHMENT#', ''),
      s3Key: params.s3Key,
      filename: params.filename,
      contentType: params.contentType,
      contentSize: params.contentSize,
      // Extracted content
      extractedText: params.extractedText,
      extractionMethod: params.extractionMethod,
      // Timestamps
      createdAt: now,
      lastAccessed: now,
      // Processing metadata
      processingDurationMs: params.processingDurationMs,
    };

    try {
      await this.dbWrapper.putItem(record);
    } catch (error) {
      this.logger.error('Failed to cache attachment content', {
        emailPk: params.emailPk,
        cacheKey: params.cacheKey,
        filename: params.filename,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update last accessed time for a cached item
   */
  async updateLastAccessed(emailPk: string, cacheKey: string): Promise<void> {
    try {
      await this.dbWrapper.updateItem({ pk: emailPk, sk: cacheKey }, 'SET lastAccessed = :now', {
        ':now': getCurrentTimestamp(),
      });
    } catch (error) {
      // Don't throw on last accessed update failures
      this.logger.warn('Failed to update last accessed time', {
        emailPk,
        cacheKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
