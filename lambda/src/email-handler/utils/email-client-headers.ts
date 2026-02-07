/**
 * Email client header extraction utilities
 * Extracts X-Mailer and User-Agent headers for provider detection
 */

/**
 * Extract email client headers from raw email content
 */
export function extractEmailClientHeaders(rawEmailContent: string): EmailClientHeaders {
  const headers: EmailClientHeaders = {};

  // Extract X-Mailer header
  const xMailerMatch = rawEmailContent.match(/^X-Mailer:\s*(.+)$/im);
  if (xMailerMatch) {
    headers.xMailer = xMailerMatch[1].trim();
  }

  // Extract User-Agent header
  const userAgentMatch = rawEmailContent.match(/^User-Agent:\s*(.+)$/im);
  if (userAgentMatch) {
    headers.userAgent = userAgentMatch[1].trim();
  }

  // Extract X-MS-Exchange-Organization-* headers (Outlook/Exchange indicators)
  const exchangeOrgMatch = rawEmailContent.match(/^X-MS-Exchange-Organization-/im);
  if (exchangeOrgMatch && !headers.xMailer) {
    headers.xMailer = 'Microsoft Exchange';
  }

  // Extract X-Originating-IP for additional context (optional)
  const originatingIpMatch = rawEmailContent.match(/^X-Originating-IP:\s*(.+)$/im);
  if (originatingIpMatch) {
    headers.originatingIp = originatingIpMatch[1].trim();
  }

  return headers;
}

/**
 * Email client headers structure
 */
interface EmailClientHeaders {
  xMailer?: string;
  userAgent?: string;
  originatingIp?: string;
}
