import { sanitizeMetadataValue } from './email-parsing';

/**
 * Shared utility for building S3 metadata for email replies
 * Standardizes metadata structure across analysis replies and reminders
 */
export function buildReplyEmailMetadata(config: {
  emailMessageId: string;
  replyFromEmail: string;
  replyTargetEmail: { from: string; subject: string };
  inReplyTo: string;
  references: string;
  additionalMetadata?: Record<string, string>;
}): Record<string, string> {
  const baseMetadata = {
    'original-message-id': sanitizeMetadataValue(config.emailMessageId),
    'reply-to': sanitizeMetadataValue(config.replyTargetEmail.from),
    from: sanitizeMetadataValue(config.replyFromEmail),
    subject: sanitizeMetadataValue(config.replyTargetEmail.subject),
    'in-reply-to': sanitizeMetadataValue(config.inReplyTo),
    references: sanitizeMetadataValue(config.references),
  };

  return { ...baseMetadata, ...config.additionalMetadata };
}
