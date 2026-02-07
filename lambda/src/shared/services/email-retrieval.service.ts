import { Logger } from '@aws-lambda-powertools/logger';
import { S3Wrapper } from '../aws';

/**
 * Service for retrieving email content from S3
 * Used by lambdas that receive bucket information from SQS records (no environment bucket needed)
 */
export class EmailRetrievalService {
  constructor(
    private readonly s3Wrapper: S3Wrapper,
    private readonly logger: Logger
  ) {}

  /**
   * Download email content from S3
   * @param objectKey S3 object key
   * @returns Email content as string
   * @throws Error if content is empty or download fails
   */
  async getEmailContent(objectKey: string): Promise<string> {
    const content = await this.s3Wrapper.getObject(objectKey);

    if (!content) {
      throw new Error('Empty email content received from storage');
    }

    return content;
  }

  /**
   * Try to get email content from S3, returning null if not available
   * @param objectKey S3 object key (optional)
   * @returns Email content as string or null if not available
   */
  async tryGetEmailContent(objectKey?: string): Promise<string | null> {
    if (!objectKey) {
      return null;
    }

    try {
      return await this.getEmailContent(objectKey);
    } catch (error) {
      this.logger.warn('Failed to retrieve email content', {
        objectKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
}
