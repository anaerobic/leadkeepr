/**
 * Service for detecting and filtering signature/footer attachments
 *
 * Identifies attachments that are likely part of email signatures or footers
 * based on common patterns like inline images, Content-ID references,
 * generic filenames, and typical signature characteristics.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { EmailAttachment } from '../../types';

export interface SignatureDetectionConfig {
  // Maximum size for signature images (bytes) - logos are typically small
  maxSignatureImageSize: number;
  // Minimum size for legitimate attachments (bytes) - avoid filtering real documents
  minLegitimateAttachmentSize: number;
  // Whether to filter all inline images
  filterAllInlineImages: boolean;
}

export class AttachmentSignatureDetector {
  private readonly config: SignatureDetectionConfig;

  constructor(
    private readonly logger: Logger,
    config?: Partial<SignatureDetectionConfig>
  ) {
    this.config = {
      maxSignatureImageSize: 100 * 1024, // 100KB - most logos are smaller
      minLegitimateAttachmentSize: 1024, // 1KB - very small threshold for legitimate content
      filterAllInlineImages: false, // Conservative default
      ...config,
    };
  }

  /**
   * Filter out signature/footer attachments from the full attachment list
   * Returns both filtered attachments and removed attachments for logging
   */
  filterSignatureAttachments(attachments: EmailAttachment[]): {
    filteredAttachments: EmailAttachment[];
    removedAttachments: EmailAttachment[];
  } {
    if (!attachments || attachments.length === 0) {
      return { filteredAttachments: [], removedAttachments: [] };
    }

    const filteredAttachments: EmailAttachment[] = [];
    const removedAttachments: EmailAttachment[] = [];

    for (const attachment of attachments) {
      if (this.isSignatureAttachment(attachment)) {
        removedAttachments.push(attachment);
        this.logger.debug('Filtered signature attachment', {
          filename: attachment.filename,
          contentType: attachment.contentType,
          size: attachment.size,
          reason: this.getFilterReason(attachment),
        });
      } else {
        filteredAttachments.push(attachment);
      }
    }

    if (removedAttachments.length > 0) {
      this.logger.info('Filtered signature attachments', {
        totalAttachments: attachments.length,
        filteredOut: removedAttachments.length,
        remaining: filteredAttachments.length,
        removedFilenames: removedAttachments.map((a) => a.filename).join(', '),
      });
    }

    return { filteredAttachments, removedAttachments };
  }

  /**
   * Determine if an attachment is likely part of an email signature/footer
   */
  private isSignatureAttachment(attachment: EmailAttachment): boolean {
    // Always preserve non-image attachments (documents, etc.)
    if (attachment.type !== 'image') {
      return false;
    }

    // Check for generic signature image filename patterns first (high confidence)
    if (this.hasGenericSignatureFilename(attachment)) {
      return true;
    }

    // Check size-based heuristics for small images (high confidence for very small images)
    if (this.isSmallSignatureImage(attachment)) {
      return true;
    }

    // For inline images with Content-ID, apply more sophisticated logic
    if (this.hasInlineDisposition(attachment) && this.hasContentId(attachment)) {
      // Only filter if it looks like a signature based on combined factors
      return this.isLikelySignatureInlineImage(attachment);
    }

    // Standalone inline disposition or Content-ID without other indicators is not enough
    // Many legitimate images are embedded inline
    return false;
  }

  /**
   * Check if attachment has inline disposition
   */
  private hasInlineDisposition(attachment: EmailAttachment): boolean {
    if (!attachment.disposition) {
      return false;
    }

    return attachment.disposition.toLowerCase().startsWith('inline');
  }

  /**
   * Check if attachment has Content-ID (indicates embedded image)
   */
  private hasContentId(attachment: EmailAttachment): boolean {
    return !!attachment.contentId;
  }

  /**
   * Check for generic signature image filename patterns
   */
  private hasGenericSignatureFilename(attachment: EmailAttachment): boolean {
    if (!attachment.filename) {
      return false;
    }

    const filename = attachment.filename.toLowerCase();

    // Generic image patterns common in signatures
    const genericPatterns = [
      /^image\d+\.(png|jpg|jpeg|gif)$/, // image001.png, image002.jpg, etc.
      /^(logo|signature|banner)\d*\.(png|jpg|jpeg|gif)$/, // logo.png, signature1.jpg, etc.
      /^(company|corp|brand)_?(logo|sig|banner)\d*\.(png|jpg|jpeg|gif)$/, // company_logo.png, etc.
      /^(email|mail)_?(signature|sig|footer)\d*\.(png|jpg|jpeg|gif)$/, // email_signature.png, etc.
    ];

    return genericPatterns.some((pattern) => pattern.test(filename));
  }

  /**
   * Check if image is small enough to be a signature element
   */
  private isSmallSignatureImage(attachment: EmailAttachment): boolean {
    if (attachment.type !== 'image' || !attachment.size) {
      return false;
    }

    // Only flag very small images as signatures (avoid false positives)
    return (
      attachment.size <= this.config.maxSignatureImageSize &&
      attachment.size >= this.config.minLegitimateAttachmentSize
    );
  }

  /**
   * Determine if an inline image with Content-ID is likely a signature image
   * Uses multiple heuristics to avoid filtering legitimate content images
   */
  private isLikelySignatureInlineImage(attachment: EmailAttachment): boolean {
    if (!attachment.size) {
      // Without size info, be conservative and preserve the image
      return false;
    }

    // Very small images are likely signature elements (logos, icons)
    if (attachment.size <= this.config.maxSignatureImageSize) {
      return true;
    }

    // Large images are likely legitimate content, not signatures
    // Most signature images are under 50KB; content images are typically larger
    const largeImageThreshold = 200 * 1024; // 200KB
    if (attachment.size > largeImageThreshold) {
      return false;
    }

    // For medium-sized images, check filename patterns
    if (this.hasGenericSignatureFilename(attachment)) {
      return true;
    }

    // Medium-sized images without signature filename patterns are likely legitimate
    return false;
  }

  /**
   * Get human-readable reason for filtering an attachment
   */
  private getFilterReason(attachment: EmailAttachment): string {
    if (this.hasInlineDisposition(attachment)) {
      return 'inline disposition';
    }
    if (this.hasContentId(attachment)) {
      return 'has Content-ID (embedded image)';
    }
    if (this.hasGenericSignatureFilename(attachment)) {
      return 'generic signature filename pattern';
    }
    if (this.isSmallSignatureImage(attachment)) {
      return `small image (${attachment.size} bytes)`;
    }
    return 'unknown';
  }
}
