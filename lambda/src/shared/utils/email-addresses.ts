/**
 * Extract email address from "Name <email@domain.com>" or "email@domain.com" format
 * Handles malformed headers gracefully, including HTML artifacts
 */
export function extractEmailAddress(emailField: string): string {
  // Remove any HTML mailto artifacts first
  const cleanField = emailField.replace(/<mailto:[^>]*$/g, '').replace(/^mailto:/, '');

  // First try to extract from <email> format
  const emailMatch = cleanField.match(/<([^>]+)>/);
  if (emailMatch && emailMatch[1]) {
    let email = emailMatch[1].trim();
    // Remove any remaining mailto: prefix
    email = email.replace(/^mailto:/, '');
    return email;
  }

  // If no angle brackets or malformed, try to extract email directly
  // Look for something that looks like an email address
  const directEmailMatch = cleanField.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (directEmailMatch) {
    return directEmailMatch[1].trim();
  }

  // Fallback: return the cleaned field trimmed
  return cleanField.trim();
}

/**
 * Extract domain from an email address
 */
function extractDomainFromEmail(email: string): string {
  const cleanEmail = extractEmailAddress(email);
  const atIndex = cleanEmail.indexOf('@');

  // Check for valid email format: must have @ symbol and characters before it
  if (atIndex <= 0) {
    return '';
  }

  const domain = cleanEmail.substring(atIndex + 1).toLowerCase();

  // Check if domain is empty or invalid
  if (!domain || domain.length === 0) {
    return '';
  }

  return domain;
}

/**
 * Check if an email is from a specific domain (case-insensitive)
 */
export function isEmailFromDomain(fromField: string, domain: string): boolean {
  if (!fromField || !domain) {
    return false;
  }

  const emailDomain = extractDomainFromEmail(fromField);
  if (!emailDomain) {
    return false;
  }

  return emailDomain === domain.toLowerCase();
}

/**
 * Sanitize email address for use as DynamoDB key
 * Extracts clean email address and converts to lowercase with trimming
 */
export function sanitizeEmailAddress(email: string): string {
  // Extract email from "Name <email>" format and convert to lowercase
  const cleanEmail = extractEmailAddress(email);
  return cleanEmail.toLowerCase().trim();
}
