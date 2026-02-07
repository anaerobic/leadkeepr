/**
 * Shared email parsing utilities
 * Common functions used across multiple email parsing services
 */

import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { v4 as uuidv4 } from 'uuid';
import { AttachmentType, EmailAttachment } from '../../types';

/**
 * Parse email content using mailparser
 * @param emailContent Raw email content string
 * @returns Parsed email object
 */
export async function parseEmailContent(emailContent: string): Promise<ParsedMail> {
  return await simpleParser(emailContent);
}

/**
 * Extract email addresses from mailparser address objects
 * Handles both single addresses and arrays of addresses
 */
export function extractEmailAddresses(
  addresses: AddressObject | AddressObject[] | { text: string } | { text: string }[] | undefined
): string[] {
  if (!addresses) return [];

  // Handle AddressObject format (from mailparser)
  if ('text' in addresses && typeof addresses.text === 'string') {
    return [addresses.text];
  }

  if (Array.isArray(addresses)) {
    return addresses.map((addr) => ('text' in addr ? addr.text : String(addr)));
  }

  return [];
}

/**
 * Extract text content from parsed email, preferring text over HTML
 * @param parsed Parsed email object from mailparser
 * @returns Extracted text content or undefined
 */
export function extractTextContent(parsed: ParsedMail): string | undefined {
  if (parsed.text) {
    return parsed.text;
  }

  if (parsed.html) {
    // Strip HTML tags and normalize HTML entities
    return parsed.html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Replace HTML entities with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  return undefined;
}

/**
 * Sanitize metadata values for HTTP headers (S3 metadata)
 * Removes characters that are not allowed in HTTP headers
 * @param value The metadata value to sanitize
 * @param maxLength Maximum length for truncation (default: 2048)
 * @returns Sanitized value safe for HTTP headers
 */
export function sanitizeMetadataValue(value: string, maxLength: number = 2048): string {
  if (!value) return '';

  const sanitized = value
    .replace(/[\r\n\t\0]/g, ' ') // Replace control characters with spaces
    .replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  if (sanitized.length > maxLength) {
    return sanitized.substring(0, maxLength) + '...';
  }

  return sanitized;
}

/**
 * Process email attachments from parsed email
 * @param parsed Parsed email object
 * @param attachmentTypeDetector Function to detect attachment types
 * @param includeContent Whether to include attachment content (default: false)
 * @returns Array of processed attachments
 */
export function processEmailAttachments(
  parsed: ParsedMail,
  attachmentTypeDetector: (contentType: string, filename?: string) => AttachmentType,
  includeContent: boolean = false
): EmailAttachment[] {
  if (!parsed.attachments) return [];

  return parsed.attachments.map((att) => ({
    filename: att.filename,
    contentType: att.contentType,
    size: att.size,
    ...(includeContent && { content: att.content }),
    type: attachmentTypeDetector(att.contentType, att.filename),
    contentId: att.contentId,
    disposition: att.contentDisposition,
  }));
}

/**
 * Extract date header from raw email content
 * @param emailContent Raw email content
 * @returns Date header string or undefined
 */
export function extractDateHeader(emailContent: string): string | undefined {
  const dateHeaderMatch = emailContent.match(/^Date:\s*(.+)$/im);
  return dateHeaderMatch?.[1]?.trim();
}

/**
 * Extract message ID from parsed email, generating one if missing
 * @param parsed Parsed email object
 * @returns Message ID string
 */
export function extractOrGenerateMessageId(parsed: ParsedMail): string {
  if (parsed.messageId) {
    return parsed.messageId;
  }

  // Generate a unique message ID if missing
  return `<${uuidv4()}@generated>`;
}

/**
 * Extract threading headers from parsed email
 * @param parsed Parsed email object
 * @returns Object with inReplyTo and references
 */
export function extractThreadingHeaders(parsed: ParsedMail): {
  inReplyTo?: string;
  references?: string;
} {
  return {
    inReplyTo: parsed.inReplyTo || undefined,
    references: Array.isArray(parsed.references)
      ? parsed.references.join(' ')
      : parsed.references || undefined,
  };
}
