/**
 * S3 key generation utilities for email storage
 */

import { extractEmailAddress } from './email-addresses';

/**
 * Generate user-specific S3 key from the original incoming email key
 * @param originalKey Original S3 key like "/incoming-emails/us-west-2/abc123"
 * @param senderEmail Sender email address 
 * @returns New S3 key like "/user/{senderEmail}/abc123"
 */
export function generateUserS3Key(originalKey: string, senderEmail: string): string {
  // Extract the file identifier from the original key
  // Format: /incoming-emails/us-west-2/messageId -> messageId
  const parts = originalKey.split('/');
  const messageId = parts[parts.length - 1]; // Get the last part (messageId)
  
  // Clean the sender email address for safe use in S3 key
  const cleanSenderEmail = extractEmailAddress(senderEmail).toLowerCase();
  
  // Generate the new key: user/{email}/messageId
  return `user/${cleanSenderEmail}/${messageId}`;
}

/**
 * Extract message ID from S3 object key
 * @param objectKey S3 object key
 * @returns Message ID string
 */
export function extractMessageIdFromS3Key(objectKey: string): string {
  const parts = objectKey.split('/');
  return parts[parts.length - 1];
}