/**
 * Tests for AttachmentSignatureDetector
 * Verifies signature/footer attachment filtering logic
 */

import { AttachmentSignatureDetector } from '../attachment-signature-detector.service';
import { EmailAttachment } from '../../../types';
import { createMockPowertools } from '../../test-utils/powertools-mocks';

describe('AttachmentSignatureDetector', () => {
  const { mockLogger } = createMockPowertools();
  let detector: AttachmentSignatureDetector;

  beforeEach(() => {
    detector = new AttachmentSignatureDetector(mockLogger);
  });

  describe('filterSignatureAttachments', () => {
    it('should filter inline images with Content-ID', () => {
      const attachments: EmailAttachment[] = [
        {
          filename: 'image001.png',
          contentType: 'image/png',
          size: 18303,
          type: 'image',
          contentId: '<image001.png@01DC2746.7F2CF900>',
          disposition: 'inline',
        },
        {
          filename: 'document.pdf',
          contentType: 'application/pdf',
          size: 50000,
          type: 'document',
        },
      ];

      const result = detector.filterSignatureAttachments(attachments);

      expect(result.filteredAttachments).toHaveLength(1);
      expect(result.filteredAttachments[0].filename).toBe('document.pdf');
      expect(result.removedAttachments).toHaveLength(1);
      expect(result.removedAttachments[0].filename).toBe('image001.png');
    });

    it('should filter images with generic signature filenames', () => {
      const attachments: EmailAttachment[] = [
        {
          filename: 'image002.jpg',
          contentType: 'image/jpeg',
          size: 25000,
          type: 'image',
        },
        {
          filename: 'logo.png',
          contentType: 'image/png',
          size: 5000,
          type: 'image',
        },
        {
          filename: 'important-screenshot.png',
          contentType: 'image/png',
          size: 150000,
          type: 'image',
        },
      ];

      const result = detector.filterSignatureAttachments(attachments);

      expect(result.filteredAttachments).toHaveLength(1);
      expect(result.filteredAttachments[0].filename).toBe('important-screenshot.png');
      expect(result.removedAttachments).toHaveLength(2);
      expect(result.removedAttachments.map((a) => a.filename)).toContain('image002.jpg');
      expect(result.removedAttachments.map((a) => a.filename)).toContain('logo.png');
    });

    it('should preserve legitimate attachments', () => {
      const attachments: EmailAttachment[] = [
        {
          filename: 'contract.pdf',
          contentType: 'application/pdf',
          size: 200000,
          type: 'document',
        },
        {
          filename: 'receipt.jpg',
          contentType: 'image/jpeg',
          size: 500000, // Large image, likely legitimate
          type: 'image',
        },
        {
          filename: 'data.csv',
          contentType: 'text/csv',
          size: 10000,
          type: 'document',
        },
      ];

      const result = detector.filterSignatureAttachments(attachments);

      expect(result.filteredAttachments).toHaveLength(3);
      expect(result.removedAttachments).toHaveLength(0);
    });

    it('should preserve attachments with Content-ID but no disposition (legitimate embedded images)', () => {
      const attachments: EmailAttachment[] = [
        {
          filename: 'embedded-image.png',
          contentType: 'image/png',
          size: 150000, // Larger than signature threshold
          type: 'image',
          contentId: '<embedded@example.com>',
        },
      ];

      const result = detector.filterSignatureAttachments(attachments);

      expect(result.filteredAttachments).toHaveLength(1);
      expect(result.removedAttachments).toHaveLength(0);
    });

    it('should handle empty attachment list', () => {
      const result = detector.filterSignatureAttachments([]);

      expect(result.filteredAttachments).toHaveLength(0);
      expect(result.removedAttachments).toHaveLength(0);
    });

    it('should preserve non-image attachments even with signature-like names', () => {
      const attachments: EmailAttachment[] = [
        {
          filename: 'image001.pdf', // PDF with image-like name
          contentType: 'application/pdf',
          size: 50000,
          type: 'document',
        },
      ];

      const result = detector.filterSignatureAttachments(attachments);

      expect(result.filteredAttachments).toHaveLength(1);
      expect(result.removedAttachments).toHaveLength(0);
    });

    it('should preserve legitimate inline images with Content-ID (large size)', () => {
      const attachments: EmailAttachment[] = [
        {
          filename: '93303.jpg', // Like the real attachment from the issue
          contentType: 'image/jpeg',
          size: 300000, // Large image, likely legitimate content
          type: 'image',
          contentId: '<7484FA7E-BD88-415B-B9B5-36DABCCEFC83>',
          disposition: 'inline',
        },
        {
          filename: 'logo.png', // Small signature image for comparison
          contentType: 'image/png',
          size: 5000,
          type: 'image',
          contentId: '<logo@example.com>',
          disposition: 'inline',
        },
      ];

      const result = detector.filterSignatureAttachments(attachments);

      expect(result.filteredAttachments).toHaveLength(1);
      expect(result.filteredAttachments[0].filename).toBe('93303.jpg');
      expect(result.removedAttachments).toHaveLength(1);
      expect(result.removedAttachments[0].filename).toBe('logo.png');
    });

    it('should filter small inline images with signature-like filenames', () => {
      const attachments: EmailAttachment[] = [
        {
          filename: 'image001.png',
          contentType: 'image/png',
          size: 50000, // Medium size
          type: 'image',
          contentId: '<image001@example.com>',
          disposition: 'inline',
        },
      ];

      const result = detector.filterSignatureAttachments(attachments);

      expect(result.filteredAttachments).toHaveLength(0);
      expect(result.removedAttachments).toHaveLength(1);
      expect(result.removedAttachments[0].filename).toBe('image001.png');
    });
  });

  describe('signature patterns from sample email', () => {
    it('should filter all signature images from the sample email', () => {
      // Based on the actual sample email attachments
      const sampleAttachments: EmailAttachment[] = [
        {
          filename: 'image001.png',
          contentType: 'image/png',
          size: 18303,
          type: 'image',
          contentId: '<image001.png@01DC2746.7F2CF900>',
          disposition: 'inline',
        },
        {
          filename: 'image002.png',
          contentType: 'image/png',
          size: 2291903,
          type: 'image',
          contentId: '<image002.png@01DC2746.7F2CF900>',
          disposition: 'inline',
        },
        {
          filename: 'image003.jpg',
          contentType: 'image/jpeg',
          size: 17607,
          type: 'image',
          contentId: '<image003.jpg@01DC2746.7F2CF900>',
          disposition: 'inline',
        },
        {
          filename: 'image004.png',
          contentType: 'image/png',
          size: 4196,
          type: 'image',
          contentId: '<image004.png@01DC2746.7F2CF900>',
          disposition: 'inline',
        },
        {
          filename: 'image005.jpg',
          contentType: 'image/jpeg',
          size: 3988,
          type: 'image',
          contentId: '<image005.jpg@01DC2746.7F2CF900>',
          disposition: 'inline',
        },
        {
          filename: 'image006.jpg',
          contentType: 'image/jpeg',
          size: 16825,
          type: 'image',
          contentId: '<image006.jpg@01DC2746.7F2CF900>',
          disposition: 'inline',
        },
      ];

      const result = detector.filterSignatureAttachments(sampleAttachments);

      // All sample attachments should be filtered as signature noise
      expect(result.filteredAttachments).toHaveLength(0);
      expect(result.removedAttachments).toHaveLength(6);

      // Verify all were filtered due to inline disposition
      result.removedAttachments.forEach((attachment) => {
        expect(attachment.disposition).toBe('inline');
        expect(attachment.contentId).toBeTruthy();
      });
    });
  });
});
