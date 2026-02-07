import { EmailContentCleanerService } from '../email-content-cleaner.service';
import { createMockPowertools } from '../../test-utils/powertools-mocks';

describe('EmailContentCleanerService', () => {
  const { mockLogger } = createMockPowertools();
  let service: EmailContentCleanerService;

  beforeEach(() => {
    service = new EmailContentCleanerService(mockLogger);
    jest.clearAllMocks();
  });

  describe('cleanEmailContent', () => {
    it('should preserve conversation content and email metadata', async () => {
      const emailContent = `From: John Doe <john@example.com>
To: Jane Smith <jane@example.com>
Subject: Project Update

Hi Jane,

I wanted to update you on the project status. We've made good progress this week.

Let me know if you have any questions.

Best regards,
John`;

      const result = await service.cleanEmailContent(emailContent);

      expect(result.cleanedContent).toContain('From: John Doe');
      expect(result.cleanedContent).toContain('Hi Jane,');
      expect(result.cleanedContent).toContain('project status');
      expect(result.cleanedContent).toContain('Best regards,');
      expect(result.cleanedContent).toContain('John');
      expect(result.preservedMetadata).toHaveLength(3); // From, To, Subject
      expect(result.confidenceScore).toBeGreaterThan(0.7);
    });

    it('should remove signature noise while preserving names', async () => {
      const emailContent = `Hi there,

This is the actual message content that should be preserved.

Thanks for your help!

Best regards,
John Smith
Senior Developer | Company Inc
📞 Phone: (555) 123-4567
📧 email: john@company.com
🌐 Website: https://company.com
This email is confidential and intended only for the recipient.`;

      const result = await service.cleanEmailContent(emailContent);

      expect(result.cleanedContent).toContain('This is the actual message content');
      expect(result.cleanedContent).toContain('Thanks for your help!');
      expect(result.cleanedContent).toContain('Best regards,');
      expect(result.cleanedContent).toContain('John Smith');

      // Should remove signature noise
      expect(result.cleanedContent).not.toContain('📞 Phone:');
      expect(result.cleanedContent).not.toContain('https://company.com');
      expect(result.cleanedContent).not.toContain('confidential and intended');

      expect(result.removedSections.length).toBeGreaterThan(0);
    });

    it('should handle email threads with multiple messages', async () => {
      const emailContent = `Thanks for the update!

John

________________________________
From: Jane Smith <jane@example.com>
Sent: Monday, September 16, 2025 2:15 PM
To: John Doe <john@example.com>
Subject: Re: Project Update

Hi John,

The project is going well. Here are the latest numbers.

Best,
Jane Smith
Project Manager
jane@company.com`;

      const result = await service.cleanEmailContent(emailContent);

      expect(result.cleanedContent).toContain('Thanks for the update!');
      expect(result.cleanedContent).toContain('From: Jane Smith');
      expect(result.cleanedContent).toContain('The project is going well');
      expect(result.preservedMetadata.length).toBeGreaterThan(0);
    });

    it('should redact critical PII information', async () => {
      const emailContent = `Please process this payment:
      
Credit Card: 4532 1234 5678 9012
SSN: 123-45-6789
Routing: 012345678

Thanks!`;

      const result = await service.cleanEmailContent(emailContent);

      expect(result.cleanedContent).toContain('[CREDIT_CARD_REDACTED]');
      expect(result.cleanedContent).toContain('[SSN_REDACTED]');
      expect(result.cleanedContent).toContain('[ROUTING_NUMBER_REDACTED]');
      expect(result.cleanedContent).not.toContain('4532 1234 5678 9012');
      expect(result.cleanedContent).not.toContain('123-45-6789');
    });

    it('should handle various signature boundary patterns', async () => {
      const testCases = [
        {
          content: `Message content here.

Thanks,
John`,
          shouldDetectBoundary: true,
          description: 'simple thanks closing',
        },
        {
          content: `Message content here.

Sincerely,
Jane Smith`,
          shouldDetectBoundary: true,
          description: 'formal sincerely closing',
        },
        {
          content: `Message content here.

Best regards,
Bob Johnson`,
          shouldDetectBoundary: true,
          description: 'best regards closing',
        },
        {
          content: `Message content here.

----------
Signature content`,
          shouldDetectBoundary: true,
          description: 'horizontal divider',
        },
      ];

      for (const testCase of testCases) {
        const result = await service.cleanEmailContent(testCase.content);

        expect(result.cleanedContent).toContain('Message content here');
        if (testCase.shouldDetectBoundary) {
          expect(result.confidenceScore).toBeGreaterThanOrEqual(0.6);
        }
      }
    });

    it('should preserve legitimate content that looks like signatures', async () => {
      const emailContent = `Hi team,

I need you to call John Smith at (555) 123-4567 about the project.
Also, please visit https://client-website.com for the requirements.

The client email is contact@client.com for future reference.

Thanks!`;

      const result = await service.cleanEmailContent(emailContent);

      // Should preserve content that's part of the actual message
      expect(result.cleanedContent).toContain('call John Smith');
      expect(result.cleanedContent).toContain('(555) 123-4567');
      expect(result.cleanedContent).toContain('https://client-website.com');
      expect(result.cleanedContent).toContain('contact@client.com');
    });

    it('should handle minimal content without signatures', async () => {
      const emailContent = `Quick question - when is the deadline?`;

      const result = await service.cleanEmailContent(emailContent);

      expect(result.cleanedContent).toBe('Quick question - when is the deadline?');
      expect(result.removedSections).toHaveLength(0);
      expect(result.preservedMetadata).toHaveLength(0);
      expect(result.confidenceScore).toBe(0.6); // Default confidence for no metadata/removal
    });

    it('should handle empty or whitespace-only content', async () => {
      const emptyContent = '';
      const whitespaceContent = '   \n  \n   ';

      const emptyResult = await service.cleanEmailContent(emptyContent);
      const whitespaceResult = await service.cleanEmailContent(whitespaceContent);

      expect(emptyResult.cleanedContent).toBe('');
      expect(whitespaceResult.cleanedContent).toBe('');
      expect(emptyResult.removedSections).toHaveLength(0);
      expect(whitespaceResult.removedSections).toHaveLength(0);
    });

    it('should handle forwarded message patterns', async () => {
      const emailContent = `See forwarded message below:

----- Forwarded message -----
From: Original Sender <sender@example.com>
Date: September 15, 2025
Subject: Important Update

This is the original message content.

Best,
Original Sender`;

      const result = await service.cleanEmailContent(emailContent);

      expect(result.cleanedContent).toContain('See forwarded message below');
      expect(result.cleanedContent).toContain('----- Forwarded message -----');
      expect(result.cleanedContent).toContain('This is the original message');
      expect(result.preservedMetadata.length).toBeGreaterThan(0);
    });

    it('should provide appropriate confidence scores', async () => {
      const highConfidenceEmail = `From: test@example.com
Subject: Test

Message content.

Best regards,
John
Phone: (555) 123-4567`;

      const lowConfidenceEmail = `Just a simple message.`;

      const highResult = await service.cleanEmailContent(highConfidenceEmail);
      const lowResult = await service.cleanEmailContent(lowConfidenceEmail);

      expect(highResult.confidenceScore).toBeGreaterThan(lowResult.confidenceScore);
      expect(highResult.confidenceScore).toBeGreaterThan(0.8);
      expect(lowResult.confidenceScore).toBe(0.6);
    });

    it('should handle email with "On X wrote:" patterns', async () => {
      const emailContent = `Thanks for the info!

On Mon, Sep 16, 2025 at 2:30 PM John Doe <john@example.com> wrote:
> Here is the original message
> with quoted content.

Let me know if you need anything else.`;

      const result = await service.cleanEmailContent(emailContent);

      expect(result.cleanedContent).toContain('Thanks for the info!');
      expect(result.cleanedContent).toContain('On Mon, Sep 16, 2025');
      expect(result.cleanedContent).toContain('Let me know if you need anything');
      expect(result.preservedMetadata.length).toBeGreaterThan(0);
    });
  });
});
