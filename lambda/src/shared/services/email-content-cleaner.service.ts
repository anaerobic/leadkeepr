/**
 * Simple Email Content Cleaner Service
 *
 * Uses simple, reliable patterns to detect where conversation ends and noise begins.
 * Focuses on the 80/20 rule - catch the most common patterns with simple logic.
 */

import { Logger } from '@aws-lambda-powertools/logger';

export interface ContentCleaningResult {
  cleanedContent: string;
  removedSections: string[];
  preservedMetadata: string[];
  confidenceScore: number;
}

export class EmailContentCleanerService {
  constructor(private readonly logger: Logger) {}

  async cleanEmailContent(content: string): Promise<ContentCleaningResult> {
    // First, protect critical PII
    const piiProtectedContent = this.redactCriticalPII(content);

    // Split into lines for processing
    const lines = piiProtectedContent.split('\n');
    const result = this.processLines(lines);

    return {
      cleanedContent: result.cleanedLines.join('\n').trim(),
      removedSections: result.removedSections,
      preservedMetadata: result.metadata,
      confidenceScore: this.calculateConfidence(result),
    };
  }

  private processLines(lines: string[]): {
    cleanedLines: string[];
    removedSections: string[];
    metadata: string[];
  } {
    const cleanedLines: string[] = [];
    const removedSections: string[] = [];
    const metadata: string[] = [];
    let inSignatureBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Always preserve email metadata for speaker identification
      if (this.isEmailMetadata(trimmed)) {
        cleanedLines.push(line);
        metadata.push(trimmed);
        continue;
      }

      // Check if we've hit a signature/footer boundary
      if (!inSignatureBlock && this.isSignatureBoundary(line, lines, i)) {
        inSignatureBlock = true;
        // Include the signature boundary line (like "Best regards," or name)
        cleanedLines.push(line);
        continue;
      }

      // If we're in signature block, decide what to keep
      if (inSignatureBlock) {
        if (this.shouldRemoveSignatureLine(trimmed)) {
          removedSections.push(trimmed.substring(0, 50) + '...');
        } else {
          cleanedLines.push(line);
        }
      } else {
        // We're in conversation content - keep everything
        cleanedLines.push(line);
      }
    }

    return { cleanedLines, removedSections, metadata };
  }

  /**
   * Detect email metadata that should always be preserved
   */
  private isEmailMetadata(line: string): boolean {
    return (
      /^(From|To|Cc|Bcc|Date|Subject):\s+/i.test(line) ||
      /^(\*\*?)?(From|To|Cc|Bcc|Date|Subject)(\*\*?)?:\s+/i.test(line) ||
      /^-+ Forwarded message -+/i.test(line) ||
      /^On .+ wrote:$/i.test(line) ||
      /^At \d+:\d+ .+ wrote:$/i.test(line)
    );
  }

  /**
   * Detect common signature boundaries where conversation ends
   */
  private isSignatureBoundary(line: string, allLines: string[], index: number): boolean {
    const trimmed = line.trim();

    // Common closing phrases
    if (/^(Best regards?|Sincerely|Thanks?|Thank you|Cheers|Warmly)[,.]?\s*$/i.test(trimmed)) {
      return true;
    }

    // Name pattern after closing (next line is likely a name)
    if (index < allLines.length - 1) {
      const nextLine = allLines[index + 1].trim();
      if (
        /^(Best regards?|Sincerely|Thanks?|Thank you|Cheers|Warmly)[,.]?\s*$/i.test(trimmed) ||
        (trimmed === '' && /^\w+\s+\w+\s*$/.test(nextLine))
      ) {
        return true;
      }
    }

    // Horizontal dividers that often separate conversation from signature
    if (/^-{10,}$/.test(trimmed) || /^={10,}$/.test(trimmed) || /^_{10,}$/.test(trimmed)) {
      return true;
    }

    // Two-word pattern that's likely a name (but not at the very beginning)
    if (index > 5 && /^\w+\s+\w+\s*$/.test(trimmed)) {
      // Check if previous line was empty or a closing
      const prevLine = allLines[index - 1]?.trim() || '';
      if (
        prevLine === '' ||
        /^(Best regards?|Sincerely|Thanks?|Thank you|Cheers|Warmly)[,.]?\s*$/i.test(prevLine)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Decide if a line in signature block should be removed
   */
  private shouldRemoveSignatureLine(line: string): boolean {
    // Remove lines with emojis (modern signature indicators)
    if (/📞|📱|🌐|🔗|📲|✉️|📧|⚠️|🔒|💬|📢|📩/u.test(line)) {
      return true;
    }

    // Remove lines with links
    if (/https?:\/\/|www\.|\.com|\.org|\.net/i.test(line)) {
      return true;
    }

    // Remove obvious disclaimer/legal text
    if (
      /confidential|proprietary|unsubscribe|gdpr|ccpa|intended recipient|delete immediately/i.test(
        line
      )
    ) {
      return true;
    }

    // Remove contact info patterns
    if (
      /office:|mobile:|phone:|direct:|email:/i.test(line) ||
      /\(\d{3}\)\s*\d{3}-\d{4}/.test(line)
    ) {
      return true;
    }

    // Remove job titles with company formatting
    if (/\*\*.*\|.*\*\*|\*.*\|.*\*/.test(line)) {
      return true;
    }

    // Remove app store/download links
    if (/app store|google play|download|ios.*android/i.test(line)) {
      return true;
    }

    // Keep simple text (likely just names or basic closings)
    return false;
  }

  /**
   * Redact critical PII for liability protection
   */
  private redactCriticalPII(content: string): string {
    let cleanContent = content;

    // Credit card numbers
    cleanContent = cleanContent.replace(
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      '[CREDIT_CARD_REDACTED]'
    );
    cleanContent = cleanContent.replace(/\b\d{4}\s?\d{6}\s?\d{5}\b/g, '[CREDIT_CARD_REDACTED]'); // Amex

    // Social Security Numbers
    cleanContent = cleanContent.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]');
    cleanContent = cleanContent.replace(/\b\d{3}\s\d{2}\s\d{4}\b/g, '[SSN_REDACTED]');

    // Bank routing numbers (9 digits starting with 0-1)
    cleanContent = cleanContent.replace(/\b[01]\d{8}\b/g, '[ROUTING_NUMBER_REDACTED]');

    return cleanContent;
  }

  private calculateConfidence(result: { removedSections: string[]; metadata: string[] }): number {
    // Simple confidence based on what we found and removed
    const hasMetadata = result.metadata.length > 0;
    const removedNoise = result.removedSections.length > 0;

    if (hasMetadata && removedNoise) return 0.9;
    if (hasMetadata) return 0.8;
    if (removedNoise) return 0.7;
    return 0.6;
  }
}
