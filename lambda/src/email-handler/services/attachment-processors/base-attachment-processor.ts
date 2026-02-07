/**
 * import { Logger } from '@aws-lambda-powertools/logger';
import { S3Client } from '@aws-sdk/client-s3';
import { createS3Client } from '../../../shared/aws';
import { EmailAttachment } from '../../../shared/types';
import { AttachmentProcessor } from './attachment-processor.interface';

export abstract class BaseAttachmentProcessor implements AttachmentProcessor {
  protected readonly s3Client: S3Client;

  constructor(protected readonly logger: Logger) {
    this.s3Client = createS3Client();
  }for attachment processors
 * Provides common functionality shared across all processors
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import { Logger } from '@aws-lambda-powertools/logger';
import { Readable } from 'stream';
import { AttachmentProcessor } from './attachment-processor.interface';
import { EmailAttachment } from '../../../types';

export abstract class BaseAttachmentProcessor implements AttachmentProcessor {
  protected readonly s3Client: S3Client;

  constructor(protected readonly logger: Logger) {
    this.s3Client = new S3Client({});
  }

  abstract processAttachment(
    attachment: EmailAttachment,
    bucketName: string,
    objectKey: string
  ): Promise<string | null>;

  abstract canProcess(attachment: EmailAttachment): boolean;

  /**
   * Download email content from S3 and parse it to extract attachments
   * Common functionality used by multiple processors
   */
  protected async downloadAndParseEmail(
    bucketName: string,
    objectKey: string
  ): Promise<{ emailContent: string; parsed: ParsedMail }> {
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    const response = await this.s3Client.send(getObjectCommand);

    if (!response.Body) {
      throw new Error(`No body found in S3 response for ${objectKey}`);
    }

    const emailContent = await this.streamToString(response.Body as Readable);

    // Parse the email to extract attachments
    const parsed = await simpleParser(emailContent);

    return { emailContent, parsed };
  }

  /**
   * Find a specific attachment by filename and content type
   */
  protected findAttachment(
    parsed: ParsedMail,
    targetAttachment: EmailAttachment
  ): Attachment | undefined {
    return parsed.attachments?.find(
      (att: Attachment) =>
        att.filename === targetAttachment.filename &&
        att.contentType === targetAttachment.contentType
    );
  }

  /**
   * Convert stream to string
   * Common utility used across processors
   */
  protected async streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString('utf-8');
  }
}
