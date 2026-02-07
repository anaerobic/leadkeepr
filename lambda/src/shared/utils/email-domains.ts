/**
 * Check if a message ID is from our system
 */
export function isSystemMessageId(messageId: string): boolean {
  if (!messageId) return false;

  const patterns = [`@${process.env.FQDN}`, '@ses.amazonaws.com']; // Only message ID patterns
  const normalizedId = messageId.toLowerCase();

  return patterns.some((pattern) => normalizedId.includes(pattern));
}
