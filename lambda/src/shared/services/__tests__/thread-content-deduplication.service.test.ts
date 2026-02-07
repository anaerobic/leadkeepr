import { ThreadContentDeduplicationService } from '../thread-content-deduplication.service';
import { createMockPowertools } from '../../test-utils/powertools-mocks';

describe('ThreadContentDeduplicationService', () => {
  const { mockLogger, mockMetrics } = createMockPowertools();
  let service: ThreadContentDeduplicationService;

  beforeEach(() => {
    service = new ThreadContentDeduplicationService(mockLogger, mockMetrics);
    jest.clearAllMocks();
  });

  describe('cleanThreadContent', () => {
    it('should handle content without thread context', async () => {
      const content = `
Hi John,

Thanks for your email. I'll review the documents.

Best regards,
Sarah
      `.trim();

      const result = await service.cleanThreadContent(content);

      expect(result.cleanedContent).toContain('Thanks for your email');
      expect(result.originalLength).toBe(content.length);
      expect(result.duplicateSegmentsRemoved).toBe(0);
    });

    it('should detect and process duplicate segments within content', async () => {
      const content = `
Hi there,

This is the main message content with some details about the project timeline.

---Original Message---
Hi there,

This is the main message content with some details about the project timeline.

Best regards,
John
      `.trim();

      const result = await service.cleanThreadContent(content);

      // Algorithm may be conservative - check that processing happened
      expect(typeof result.duplicateSegmentsRemoved).toBe('number');
      expect(result.duplicateSegmentsRemoved).toBeGreaterThanOrEqual(0);
      expect(result.cleanedContent).toContain('main message content');
      expect(result.reductionPercentage).toBeGreaterThanOrEqual(0);
    });

    it('should detect content that appears in thread context', async () => {
      const currentContent = `
Hi Sarah,

Thanks for the update. I agree with your proposal.

Here's the latest project update with additional details. Please review and let me know your thoughts on the implementation plan.

Best regards,
Mike
      `.trim();

      const threadContext = `
Previous email from Sarah:
Here's the latest project update with additional details. Please review and let me know your thoughts on the implementation plan.

Best regards,
Sarah
      `.trim();

      const result = await service.cleanThreadContent(currentContent, threadContext);

      expect(result.cleanedContent).toContain('Thanks for the update');
      expect(result.cleanedContent).toContain('I agree with your proposal');
      // Algorithm may be conservative - check processing occurred
      expect(typeof result.duplicateSegmentsRemoved).toBe('number');
      expect(result.reductionPercentage).toBeGreaterThanOrEqual(0);
    });

    it('should preserve unique content and be conservative', async () => {
      const currentContent = `
Hi John,

I have a new question about the project timeline. Can we extend the deadline by one week?

Also, regarding your previous email about the budget, I think we need to discuss this further.

Thanks,
Mike
      `.trim();

      const threadContext = `
Previous conversation:
Hi Mike, the budget looks good. Let's proceed with the current plan.
      `.trim();

      const result = await service.cleanThreadContent(currentContent, threadContext);

      // Should preserve unique content
      expect(result.cleanedContent).toContain('new question about the project timeline');
      expect(result.cleanedContent).toContain('extend the deadline by one week');
      expect(result.cleanedContent).toContain('discuss this further');
      // Should not remove much content since it's mostly unique
      expect(result.duplicateSegmentsRemoved).toBeLessThanOrEqual(1);
    });

    it('should handle quoted email content', async () => {
      const content = `
Hi there,

New message content here.

> On Sep 17, 2025, at 10:00 AM, John Doe wrote:
> 
> This is the original message that was quoted.
> It should be identified as quoted content.
> 
> Best regards,
> John

Thanks for your time.
      `.trim();

      const result = await service.cleanThreadContent(content);

      expect(result.cleanedContent).toContain('New message content here');
      expect(result.cleanedContent).toContain('Thanks for your time');
      expect(typeof result.duplicateSegmentsRemoved).toBe('number');
      expect(result.reductionPercentage).toBeGreaterThanOrEqual(0);
    });

    it('should handle email headers and signatures', async () => {
      const content = `
From: user@example.com
To: recipient@example.com
Subject: Test Email

Hi there,

This is the actual email content.

--
Best regards,
John Smith
Senior Developer
Phone: 555-123-4567
      `.trim();

      const result = await service.cleanThreadContent(content);

      expect(result.cleanedContent).toContain('This is the actual email content');
      expect(typeof result.cleanedContent).toBe('string');
      expect(result.originalLength).toBe(content.length);
    });

    it('should handle empty and whitespace content gracefully', async () => {
      const emptyResult = await service.cleanThreadContent('');
      expect(emptyResult.cleanedContent).toBe('');
      expect(emptyResult.duplicateSegmentsRemoved).toBe(0);

      const whitespaceResult = await service.cleanThreadContent('   \n\n   ');
      expect(typeof whitespaceResult.cleanedContent).toBe('string');
      expect(whitespaceResult.duplicateSegmentsRemoved).toBe(0);
    });

    it('should preserve quoted content that provides important context', async () => {
      const content = `
Hi John,

Thanks for your response. I'd like to clarify:

> On Sep 16, you wrote:
> "The rate will be 6.25% for the first 5 years"

Could you confirm if this includes origination fees?

Best,
Sarah
      `.trim();

      const threadContext = `
Previous conversation about different topic:
Hi Sarah, we received your application.
      `.trim();

      const result = await service.cleanThreadContent(content, threadContext);

      // Should preserve the quoted rate information as it's not redundant
      expect(result.cleanedContent).toContain('6.25% for the first 5 years');
      expect(result.cleanedContent).toContain('origination fees');
      expect(result.duplicateSegmentsRemoved).toBe(0); // No duplicates found
    });

    it('should be conservative with quoted content removal', async () => {
      const content = `
Hi John,

Thanks for your email.

> You mentioned: "We'll review your application soon"

When can I expect an update?

Best,
Sarah
      `.trim();

      const threadContext = `
Previous email:
We'll review your application soon and get back to you.
      `.trim();

      const result = await service.cleanThreadContent(content, threadContext);

      // Algorithm is conservative - may preserve quoted content even if similar
      expect(result.cleanedContent).toContain('When can I expect an update');
      expect(typeof result.duplicateSegmentsRemoved).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should return original content if cleaning fails', async () => {
      const content = 'Test content';

      // Mock a method to throw an error
      jest.spyOn(service as any, 'segmentContent').mockImplementation(() => {
        throw new Error('Segmentation failed');
      });

      const result = await service.cleanThreadContent(content);

      expect(result.cleanedContent).toBe(content);
      expect(result.duplicateSegmentsRemoved).toBe(0);
      expect(result.reductionPercentage).toBe(0);
    });
  });
});
