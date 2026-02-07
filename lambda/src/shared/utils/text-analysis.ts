/**
 * Text analysis and comparison utilities
 * Provides functions for analyzing and comparing text content
 */

import { normalizeWhitespace } from './formatting-utils';

/**
 * Extract clean content from attachment content by removing markers
 */
function extractCleanAttachmentContent(attachmentContent: string): string {
  let cleaned = attachmentContent.replace(/\n--- Content from attachment:.*?---\n/g, '');
  cleaned = cleaned.trim();
  if (cleaned.length < 50) {
    return '';
  }
  return cleaned;
}

/**
 * Calculate the content overlap between two text blocks using word intersection
 * Returns a value between 0 (no overlap) and 1 (complete overlap)
 * Ignores short words (3 chars or less) to reduce noise from common words
 *
 * @param text1 First text block to compare
 * @param text2 Second text block to compare
 * @returns Number between 0-1 representing the overlap percentage
 */
function calculateContentOverlap(text1: string, text2: string): number {
  if (!text1 || !text2) {
    return 0;
  }

  // Normalize both texts for better comparison
  const normalize = (text: string) => normalizeWhitespace(text.toLowerCase());
  const normalizedText1 = normalize(text1);
  const normalizedText2 = normalize(text2);

  // Convert to sets of significant words (filtering out short words)
  const words1 = new Set(normalizedText1.split(' ').filter((w) => w.length > 3));
  const words2 = new Set(normalizedText2.split(' ').filter((w) => w.length > 3));

  if (words2.size === 0) {
    return 0;
  }

  // Calculate intersection
  const intersection = new Set([...words1].filter((word) => words2.has(word)));

  // Return intersection size divided by second text's word count
  return intersection.size / words2.size;
}

/**
 * Checks if one text content is already included within another
 * Uses various strategies including direct inclusion and content overlap measurement
 *
 * @param existingContent Main text content to check against
 * @param newContent Content to check for inclusion
 * @param overlapThreshold Threshold for considering content as overlapping (0-1)
 * @returns Boolean indicating if content is already included
 */
export function isContentAlreadyIncluded(
  existingContent: string,
  newContent: string,
  overlapThreshold: number = 0.8
): boolean {
  if (!existingContent || !newContent) {
    return false;
  }

  // Strategy 1: Check if clean content is directly included
  const cleanContent = extractCleanAttachmentContent(newContent);
  if (cleanContent && existingContent.includes(cleanContent)) {
    return true;
  }

  // Strategy 2: Check if trimmed content is directly included
  if (existingContent.includes(newContent.trim())) {
    return true;
  }

  // Strategy 3: Calculate word-based overlap percentage
  const overlapPercentage = calculateContentOverlap(existingContent, cleanContent);
  if (overlapPercentage > overlapThreshold) {
    return true;
  }

  return false;
}
