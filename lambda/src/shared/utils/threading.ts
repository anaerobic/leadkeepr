import { IncomingEmailParsed } from '../../types';
import { isSystemMessageId } from './email-domains';

/**
 * Convert references to string format for consistent storage
 */
export function referencesToString(references: string | string[] | undefined): string {
  if (!references) return '';
  return Array.isArray(references) ? references.join(' ') : references;
}

/**
 * Basic heuristic to determine if this is a reply to an email we sent
 * This is a simple check based on message ID patterns - can be enhanced later
 * Returns true if the In-Reply-To or References contain our system's message IDs
 */
export function isReplyToOurEmail(emailMetadata: IncomingEmailParsed): boolean {
  const inReplyTo = emailMetadata.inReplyTo || '';
  const references = referencesToString(emailMetadata.references);

  const combinedHeaders = `${inReplyTo} ${references}`;

  return isSystemMessageId(combinedHeaders);
}

/**
 * Determine thread ID based on email headers
 * Returns the root message ID of the thread, or this message's ID if it's a new thread
 * 
 * Simple approach: Use the first reference as threadId (original thread starter per RFC 5322)
 * No database lookups needed - threadId doesn't need to exist in our table
 */
export function determineThreadId(parsedEmail: IncomingEmailParsed): string {
  // Check references header first - first reference is the thread root per RFC 5322
  if (parsedEmail.references) {
    const references = Array.isArray(parsedEmail.references)
      ? parsedEmail.references
      : parsedEmail.references.split(/\s+/);

    // Use the FIRST reference as thread root
    const firstRef = references[0]?.trim();
    if (firstRef) {
      return firstRef;
    }
  }

  // If no references but has inReplyTo, use inReplyTo as thread root
  if (parsedEmail.inReplyTo) {
    return parsedEmail.inReplyTo;
  }

  // This is a new thread - use this message's ID as the thread root
  return parsedEmail.messageId;
}
