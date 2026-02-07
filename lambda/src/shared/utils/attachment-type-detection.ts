/**
 * Shared attachment type detection utilities
 * Provides comprehensive attachment type classification
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { AttachmentType } from '../../types';

/**
 * Detect attachment type based on content type and filename
 * Returns 'email' | 'image' | 'document' | 'other'
 */
function detectAttachmentType(contentType?: string, filename?: string): AttachmentType {
  // Normalize inputs
  const normalizedContentType = contentType?.toLowerCase() || '';
  const normalizedFilename = filename?.toLowerCase() || '';

  // Extract file extension if available
  const fileExtension = normalizedFilename.includes('.')
    ? normalizedFilename.split('.').pop() || ''
    : '';

  // Check for email attachments first (most specific)
  if (isEmailAttachment(normalizedContentType, fileExtension)) {
    return 'email';
  }

  // Check for images
  if (isImageAttachment(normalizedContentType, fileExtension)) {
    return 'image';
  }

  // Check for documents
  if (isDocumentAttachment(normalizedContentType, fileExtension)) {
    return 'document';
  }

  // Default to 'other' for unknown types
  return 'other';
}

/**
 * Check if attachment is an email file
 */
function isEmailAttachment(contentType: string, fileExtension: string): boolean {
  // RFC 822 email message content types
  const emailContentTypes = [
    'message/rfc822',
    'message/rfc2822',
    'text/rfc822-headers',
    'application/x-email',
  ];

  // Common email file extensions
  const emailExtensions = ['eml', 'msg', 'mbox'];

  return (
    emailContentTypes.some((type) => contentType.includes(type)) ||
    emailExtensions.includes(fileExtension)
  );
}

/**
 * Check if attachment is an image file
 */
function isImageAttachment(contentType: string, fileExtension: string): boolean {
  // Simple content type check first (for performance)
  if (contentType.startsWith('image/')) {
    return true;
  }

  // Comprehensive image content types
  const imageContentTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/tif',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
  ];

  // Common image file extensions
  const imageExtensions = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'bmp',
    'tiff',
    'tif',
    'webp',
    'svg',
    'ico',
    'icon',
  ];

  return (
    imageContentTypes.some((type) => contentType.includes(type)) ||
    imageExtensions.includes(fileExtension)
  );
}

/**
 * Check if attachment is a document file
 */
function isDocumentAttachment(contentType: string, fileExtension: string): boolean {
  // Simple content type checks first (for performance)
  if (contentType.includes('pdf') || contentType.startsWith('text/')) {
    return true;
  }

  // Comprehensive document content types
  const documentContentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
  ];

  // Common document file extensions
  const documentExtensions = [
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'txt',
    'csv',
    'rtf',
    'odt',
    'ods',
    'odp',
    'md',
  ];

  return (
    documentContentTypes.some((type) => contentType.includes(type)) ||
    documentExtensions.includes(fileExtension)
  );
}

/**
 * Simple attachment type detector class
 * Provides a class-based interface for consistency with existing code
 */
export class AttachmentTypeDetector {
  constructor(private readonly logger?: Logger) {}

  detectAttachmentType(contentType?: string, filename?: string): AttachmentType {
    const result = detectAttachmentType(contentType, filename);

    return result;
  }
}
