/**
 * Email Content Utilities - Centralized email content processing
 *
 * Provides utilities for combining email content with attachments while
 * avoiding duplication and maintaining clean content structure.
 */

import { IncomingEmailParsed } from '../../types';
import { AttachmentContentService } from '../services/attachment-content.service';

/**
 * Build complete email content by combining existing content with attachment content
 * Implements smart deduplication to avoid redundant content
 */
export function buildCompleteEmailContent(
  parsedEmail: IncomingEmailParsed,
  attachmentContent: string,
  attachmentContentService: AttachmentContentService
): string {
  // Start with the initial email content that was built during parsing
  let content = parsedEmail.emailTextContent || '';

  // Only append attachment content if it's not already included and has meaningful content
  if (attachmentContent.trim()) {
    // Check if attachment content is already included in the existing content
    const isAlreadyIncluded = attachmentContentService.isAttachmentContentAlreadyIncluded(
      content,
      attachmentContent
    );

    if (!isAlreadyIncluded) {
      // Add spacing if we already have content
      if (content.trim()) {
        content += '\n\n';
      }
      content += attachmentContent;
    }
  }

  return content.trim();
}

/**
 * Extract sender email address from parsed email
 * Centralizes the email extraction logic used throughout the processor
 */
export function extractSenderEmail(parsedEmail: IncomingEmailParsed): string {
  // This could be enhanced to handle more complex email parsing scenarios
  const emailMatch = parsedEmail.from.match(/<(.+?)>/);
  return emailMatch ? emailMatch[1] : parsedEmail.from;
}

/**
 * Determine if email should be skipped to prevent infinite loops
 */
export function shouldSkipEmail(
  parsedEmail: IncomingEmailParsed,
  hostedZoneName?: string
): { skip: boolean; reason?: string } {
  if (!hostedZoneName) {
    return { skip: false };
  }

  // Check if email is from our own domain
  const senderEmail = extractSenderEmail(parsedEmail);
  const isFromOwnDomain = senderEmail.includes(`@${hostedZoneName}`);

  if (isFromOwnDomain) {
    return {
      skip: true,
      reason: 'Email from own domain - preventing infinite loop',
    };
  }

  return { skip: false };
}
