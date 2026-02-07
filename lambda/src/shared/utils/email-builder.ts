/**
 * Utility for building RFC822 compliant emails with multipart content and attachments
 */

/**
 * Email attachment interface for raw email building
 */
export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded content
  contentType: string;
  disposition?: 'attachment' | 'inline';
}

/**
 * ICS calendar attachment interface for raw email building
 */
export interface ICSAttachment {
  filename: string;
  content: string; // Plain text ICS content (not base64)
  method?: 'REQUEST' | 'REPLY' | 'CANCEL';
}

/**
 * Email content interface
 */
export interface EmailContent {
  html: string;
  text: string;
}

/**
 * Email headers interface
 */
export interface EmailHeaders {
  from: string;
  to: string;
  subject: string;
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  date?: string;
}

import { generateRandomId } from './formatting-utils';

/**
 * Generate a unique boundary string for multipart emails
 */
export function generateBoundary(prefix: string = 'boundary'): string {
  return `${prefix}_${Date.now()}_${generateRandomId()}`;
}

/**
 * Build a simple multipart/alternative email (HTML + text, no attachments)
 */
export function buildMultipartAlternativeEmail(
  headers: EmailHeaders,
  content: EmailContent
): string {
  const boundary = generateBoundary();

  const email = [
    `From: ${headers.from}`,
    `To: ${headers.to}`,
    `Subject: ${headers.subject}`,
    ...(headers.date ? [`Date: ${headers.date}`] : []),
    ...(headers.replyTo ? [`Reply-To: ${headers.replyTo}`] : []),
    ...(headers.messageId ? [`Message-ID: ${headers.messageId}`] : []),
    ...(headers.inReplyTo ? [`In-Reply-To: ${headers.inReplyTo}`] : []),
    ...(headers.references ? [`References: ${headers.references}`] : []),
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    content.text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    content.html,
    ``,
    `--${boundary}--`,
  ].join('\r\n');

  return email;
}

/**
 * Build a multipart/mixed email with attachments
 */
export function buildMultipartMixedEmail(
  headers: EmailHeaders,
  content: EmailContent,
  attachments: EmailAttachment[]
): string {
  const outerBoundary = generateBoundary('mixed');
  const innerBoundary = generateBoundary('alt');

  const emailParts = [
    `From: ${headers.from}`,
    `To: ${headers.to}`,
    `Subject: ${headers.subject}`,
    ...(headers.date ? [`Date: ${headers.date}`] : []),
    ...(headers.replyTo ? [`Reply-To: ${headers.replyTo}`] : []),
    ...(headers.messageId ? [`Message-ID: ${headers.messageId}`] : []),
    ...(headers.inReplyTo ? [`In-Reply-To: ${headers.inReplyTo}`] : []),
    ...(headers.references ? [`References: ${headers.references}`] : []),
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
    ``,
    // Inner multipart/alternative for HTML + text
    `--${outerBoundary}`,
    `Content-Type: multipart/alternative; boundary="${innerBoundary}"`,
    ``,
    `--${innerBoundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    content.text,
    ``,
    `--${innerBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    content.html,
    ``,
    `--${innerBoundary}--`,
  ];

  // Add attachments
  for (const attachment of attachments) {
    emailParts.push(
      ``,
      `--${outerBoundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      `Content-Disposition: ${attachment.disposition || 'attachment'}; filename="${attachment.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      attachment.content
    );
  }

  // Close the outer boundary
  emailParts.push(``, `--${outerBoundary}--`);

  return emailParts.join('\r\n');
}

/**
 * Build a multipart/mixed email with ICS calendar attachments
 * Specialized for calendar invites that need text/calendar content type
 */
export function buildMultipartEmailWithICS(
  headers: EmailHeaders,
  content: EmailContent,
  icsAttachments: ICSAttachment[]
): string {
  const outerBoundary = generateBoundary('mixed');
  const innerBoundary = generateBoundary('alt');

  const emailParts = [
    `From: ${headers.from}`,
    `To: ${headers.to}`,
    `Subject: ${headers.subject}`,
    ...(headers.date ? [`Date: ${headers.date}`] : []),
    ...(headers.replyTo ? [`Reply-To: ${headers.replyTo}`] : []),
    ...(headers.messageId ? [`Message-ID: ${headers.messageId}`] : []),
    ...(headers.inReplyTo ? [`In-Reply-To: ${headers.inReplyTo}`] : []),
    ...(headers.references ? [`References: ${headers.references}`] : []),
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
    ``,
    // Inner multipart/alternative for HTML + text
    `--${outerBoundary}`,
    `Content-Type: multipart/alternative; boundary="${innerBoundary}"`,
    ``,
    `--${innerBoundary}`,
    `Content-Type: text/plain; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    content.text,
    ``,
    `--${innerBoundary}`,
    `Content-Type: text/html; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    content.html,
    ``,
    `--${innerBoundary}--`,
  ];

  // Add ICS calendar attachments
  for (const icsAttachment of icsAttachments) {
    const method = icsAttachment.method || 'REQUEST';
    emailParts.push(
      ``,
      `--${outerBoundary}`,
      `Content-Type: text/calendar; charset="utf-8"; method=${method}`,
      `Content-Transfer-Encoding: 7bit`,
      `Content-Disposition: attachment; filename="${icsAttachment.filename}"`,
      ``,
      // Ensure proper CRLF line endings for ICS content
      icsAttachment.content.replace(/\r?\n/g, '\r\n')
    );
  }

  // Close the outer boundary
  emailParts.push(``, `--${outerBoundary}--`);

  return emailParts.join('\r\n');
}

/**
 * Extract plain text from HTML content for text/plain email parts
 */
export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

/**
 * Encode content as base64 for email attachments
 */
export function encodeAttachmentContent(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64');
}