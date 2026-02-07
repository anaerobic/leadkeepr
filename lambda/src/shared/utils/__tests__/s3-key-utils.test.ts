/**
 * Tests for S3 key generation utilities
 */

import { generateUserS3Key, extractMessageIdFromS3Key } from '../s3-key-utils';

describe('S3 Key Utils', () => {
  describe('generateUserS3Key', () => {
    it('should generate user-specific S3 key from incoming email key', () => {
      const originalKey = '/incoming-emails/us-west-2/abc123';
      const senderEmail = 'test@example.com';
      
      const result = generateUserS3Key(originalKey, senderEmail);
      
      expect(result).toBe('user/test@example.com/abc123');
    });

    it('should handle complex email addresses', () => {
      const originalKey = '/incoming-emails/us-west-2/message-456';
      const senderEmail = 'John Doe <john.doe+test@company.org>';
      
      const result = generateUserS3Key(originalKey, senderEmail);
      
      expect(result).toBe('user/john.doe+test@company.org/message-456');
    });

    it('should handle keys without leading slash', () => {
      const originalKey = 'incoming-emails/us-west-2/xyz789';
      const senderEmail = 'user@domain.com';
      
      const result = generateUserS3Key(originalKey, senderEmail);
      
      expect(result).toBe('user/user@domain.com/xyz789');
    });
  });

  describe('extractMessageIdFromS3Key', () => {
    it('should extract message ID from S3 key', () => {
      const objectKey = '/incoming-emails/us-west-2/message123';
      
      const result = extractMessageIdFromS3Key(objectKey);
      
      expect(result).toBe('message123');
    });

    it('should extract message ID from user-specific key', () => {
      const objectKey = 'user/test@example.com/message456';
      
      const result = extractMessageIdFromS3Key(objectKey);
      
      expect(result).toBe('message456');
    });
  });
});