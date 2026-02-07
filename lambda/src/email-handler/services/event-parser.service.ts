import { Logger } from '@aws-lambda-powertools/logger';
import { decodeUrlComponent } from '../../shared/utils/formatting-utils';

/**
 * Simplified S3 event data for processing
 */
interface S3EventData {
  bucketName: string;
  objectKey: string;
}

export class EventParserService {
  constructor(private readonly logger: Logger) {}

  /**
   * Parse SQS record to extract S3 event information
   */
  parseS3Event(sqsRecord: { body: string; messageId?: string }): S3EventData | null {
    // Parse S3 notification from SQS message
    const s3Event = JSON.parse(sqsRecord.body);

    // Check if this is an S3 test event
    if (s3Event.Event === 's3:TestEvent') {
      return null;
    }

    // Check if Records array exists
    if (!s3Event.Records || !Array.isArray(s3Event.Records) || s3Event.Records.length === 0) {
      return null;
    }

    const s3Record = s3Event.Records[0];

    // Validate S3 record structure
    if (!s3Record.s3 || !s3Record.s3.bucket || !s3Record.s3.object) {
      return null;
    }

    const bucketName = s3Record.s3.bucket.name;
    const objectKey = decodeUrlComponent(s3Record.s3.object.key);

    return { bucketName, objectKey };
  }
}
