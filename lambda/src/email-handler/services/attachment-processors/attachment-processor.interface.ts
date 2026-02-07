/**
 * Common interface for all attachment processors
 * Defines the contract that all attachment type processors must implement
 */

import { EmailAttachment } from '../../../types';

export interface AttachmentProcessor {
  /**
   * Process a single attachment and extract its content
   * @param attachment The attachment metadata
   * @param bucketName S3 bucket containing the email
   * @param objectKey S3 object key for the email
   * @returns Extracted text content or null if processing fails
   */
  processAttachment(
    attachment: EmailAttachment,
    bucketName: string,
    objectKey: string
  ): Promise<string | null>;

  /**
   * Check if this processor can handle the given attachment type
   * @param attachment The attachment to check
   * @returns True if this processor can handle the attachment
   */
  canProcess(attachment: EmailAttachment): boolean;
}
