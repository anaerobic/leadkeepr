/**
 * Thread Content Deduplication Service
 *
 * Cleans thread content by removing duplicate content that commonly occurs when:
 * - Users reply to existing threads and include the full thread in their reply
 * - Previous emails in the thread get attached or forwarded with new emails
 * - Email clients automatically include quoted content multiple times
 *
 * This service helps reduce token usage in AI analysis and improves content quality
 * by eliminating redundant information while preserving the chronological order
 * and important context.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

interface ThreadCleaningResult {
  cleanedContent: string;
  cleanedThreadContext?: string;
  duplicateSegmentsRemoved: number;
  originalLength: number;
  cleanedLength: number;
  reductionPercentage: number;
}

interface ContentSegment {
  content: string;
  hash: string;
  position: number;
  length: number;
  isQuoted: boolean;
  confidenceScore: number; // How confident we are this is duplicate content
}

export class ThreadContentDeduplicationService {
  private readonly minSegmentLength = 50; // Minimum length to consider for deduplication
  private readonly similarityThreshold = 0.85; // Threshold for considering content similar
  private readonly confidenceThreshold = 0.8; // Minimum confidence to remove content

  constructor(
    private readonly logger: Logger,
    private readonly metrics?: Metrics
  ) {}

  /**
   * Clean thread content by removing duplicates while preserving context
   */
  async cleanThreadContent(
    currentContent: string,
    threadContext?: string
  ): Promise<ThreadCleaningResult> {
    const startTime = Date.now();
    const originalLength = currentContent.length;

    this.logger.debug('Starting thread content deduplication', {
      currentContentLength: originalLength,
      hasThreadContext: !!threadContext,
      threadContextLength: threadContext?.length || 0,
    });

    try {
      let result: ThreadCleaningResult;

      // If no thread context, just clean internal duplicates in current content
      if (!threadContext) {
        this.logger.debug('Cleaning internal duplicates only (no thread context)');
        result = this.cleanInternalDuplicates(currentContent);
      } else {
        this.logger.debug('Cleaning duplicates against thread context');
        // Clean duplicates between current content and thread context
        result = this.cleanContentAgainstThread(currentContent, threadContext);
      }

      const duration = Date.now() - startTime;

      this.logger.debug('Thread content deduplication completed', {
        originalLength: result.originalLength,
        cleanedLength: result.cleanedLength,
        duplicateSegmentsRemoved: result.duplicateSegmentsRemoved,
        reductionPercentage: result.reductionPercentage,
        durationMs: duration,
      });

      if (this.metrics) {
        this.metrics.addMetric('ThreadDeduplicationProcessingTime', MetricUnit.Milliseconds, duration);
        this.metrics.addMetric('ThreadDeduplicationReductionPercentage', MetricUnit.Percent, result.reductionPercentage);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Error cleaning thread content', {
        error: error instanceof Error ? error.message : 'Unknown error',
        originalLength,
        durationMs: duration,
      });

      if (this.metrics) {
        this.metrics.addMetric('ThreadDeduplicationError', MetricUnit.Count, 1);
      }

      // Return original content if cleaning fails
      return {
        cleanedContent: currentContent,
        cleanedThreadContext: threadContext,
        duplicateSegmentsRemoved: 0,
        originalLength,
        cleanedLength: originalLength,
        reductionPercentage: 0,
      };
    }
  }

  /**
   * Clean internal duplicates within the current content
   */
  private cleanInternalDuplicates(content: string): ThreadCleaningResult {
    const segments = this.segmentContent(content);
    const duplicateSegments = this.findInternalDuplicates(segments);

    // Remove high-confidence duplicates
    const segmentsToRemove = duplicateSegments.filter(
      (seg) => seg.confidenceScore >= this.confidenceThreshold
    );

    const cleanedContent = this.removeSegments(content, segmentsToRemove);

    return {
      cleanedContent,
      duplicateSegmentsRemoved: segmentsToRemove.length,
      originalLength: content.length,
      cleanedLength: cleanedContent.length,
      reductionPercentage: ((content.length - cleanedContent.length) / content.length) * 100,
    };
  }

  /**
   * Clean current content against thread context to remove duplicates
   */
  private cleanContentAgainstThread(
    currentContent: string,
    threadContext: string
  ): ThreadCleaningResult {
    const currentSegments = this.segmentContent(currentContent);
    const threadSegments = this.segmentContent(threadContext);

    // Find segments in current content that appear in thread context
    const duplicateSegments = this.findCrossThreadDuplicates(currentSegments, threadSegments);

    // Find segments in thread context that appear in current content (reverse direction)
    const threadDuplicateSegments = this.findCrossThreadDuplicates(threadSegments, currentSegments);

    // Remove high-confidence duplicates from both, but be conservative
    const contentSegmentsToRemove = duplicateSegments.filter(
      (seg) => seg.confidenceScore >= this.confidenceThreshold
    );

    const threadSegmentsToRemove = threadDuplicateSegments.filter(
      (seg) => seg.confidenceScore >= this.confidenceThreshold
    );

    const cleanedContent = this.removeSegments(currentContent, contentSegmentsToRemove);
    const cleanedThreadContext = this.removeSegments(threadContext, threadSegmentsToRemove);

    return {
      cleanedContent,
      cleanedThreadContext,
      duplicateSegmentsRemoved: contentSegmentsToRemove.length + threadSegmentsToRemove.length,
      originalLength: currentContent.length,
      cleanedLength: cleanedContent.length,
      reductionPercentage:
        ((currentContent.length - cleanedContent.length) / currentContent.length) * 100,
    };
  }

  /**
   * Segment content into analyzable chunks
   */
  private segmentContent(content: string): ContentSegment[] {
    const segments: ContentSegment[] = [];
    const lines = content.split('\n');

    let currentSegment = '';
    let startPosition = 0;
    let currentPosition = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isQuoted = this.isQuotedLine(line);

      currentSegment += line + '\n';
      currentPosition += line.length + 1;

      // Create segment when we reach minimum length or significant boundary
      if (
        currentSegment.length >= this.minSegmentLength &&
        (i === lines.length - 1 || this.isSegmentBoundary(line, lines[i + 1]))
      ) {
        segments.push({
          content: currentSegment.trim(),
          hash: this.generateContentHash(currentSegment.trim()),
          position: startPosition,
          length: currentSegment.length,
          isQuoted,
          confidenceScore: 0, // Will be calculated later
        });

        currentSegment = '';
        startPosition = currentPosition;
      }
    }

    return segments;
  }

  /**
   * Check if a line appears to be quoted content
   */
  private isQuotedLine(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('>') ||
      (trimmed.startsWith('On ') && trimmed.includes('wrote:')) ||
      trimmed.startsWith('From:') ||
      trimmed.startsWith('Sent:') ||
      trimmed.startsWith('To:') ||
      trimmed.startsWith('Subject:') ||
      /^-{3,}/.test(trimmed) || // Separator lines
      /^_{3,}/.test(trimmed)
    );
  }

  /**
   * Check if this is a natural segment boundary
   */
  private isSegmentBoundary(currentLine: string, nextLine?: string): boolean {
    if (!nextLine) return true;

    const current = currentLine.trim();
    const next = nextLine.trim();

    // Email header boundaries
    if (this.isQuotedLine(next) && !this.isQuotedLine(current)) return true;
    if (!this.isQuotedLine(next) && this.isQuotedLine(current)) return true;

    // Paragraph boundaries (empty lines)
    if (current === '' && next !== '') return true;

    // Signature boundaries
    if (current.startsWith('--') || current.startsWith('Best') || current.startsWith('Thanks')) {
      return true;
    }

    return false;
  }

  /**
   * Find internal duplicates within the same content
   */
  private findInternalDuplicates(segments: ContentSegment[]): ContentSegment[] {
    const duplicates: ContentSegment[] = [];
    const seenHashes = new Set<string>();

    for (const segment of segments) {
      if (seenHashes.has(segment.hash)) {
        segment.confidenceScore = 0.9; // High confidence for exact hash matches
        duplicates.push(segment);
      } else {
        seenHashes.add(segment.hash);

        // Check for similar content (not exact matches)
        const similarSegments = segments.filter(
          (other) =>
            other !== segment &&
            this.calculateSimilarity(segment.content, other.content) >= this.similarityThreshold
        );

        if (similarSegments.length > 0) {
          // Mark later occurrences as duplicates with lower confidence
          segment.confidenceScore = 0.7;
          duplicates.push(segment);
        }
      }
    }

    return duplicates;
  }

  /**
   * Find duplicates between current content and thread context
   */
  private findCrossThreadDuplicates(
    currentSegments: ContentSegment[],
    threadSegments: ContentSegment[]
  ): ContentSegment[] {
    const duplicates: ContentSegment[] = [];
    const threadHashes = new Set(threadSegments.map((seg) => seg.hash));

    for (const segment of currentSegments) {
      // Exact hash match with thread context
      if (threadHashes.has(segment.hash)) {
        segment.confidenceScore = 0.95; // Very high confidence
        duplicates.push(segment);
        continue;
      }

      // Check for similar content in thread
      const maxSimilarity = Math.max(
        ...threadSegments.map((threadSeg) =>
          this.calculateSimilarity(segment.content, threadSeg.content)
        ),
        0
      );

      if (maxSimilarity >= this.similarityThreshold) {
        // Be more conservative with cross-thread duplicates
        segment.confidenceScore = Math.min(maxSimilarity * 0.8, 0.85);

        // Only consider as duplicate if confidence is high enough
        if (segment.confidenceScore >= this.confidenceThreshold) {
          duplicates.push(segment);
        }
      }
    }

    return duplicates;
  }

  /**
   * Calculate similarity between two text segments
   */
  private calculateSimilarity(text1: string, text2: string): number {
    // Normalize text for comparison
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();

    const norm1 = normalize(text1);
    const norm2 = normalize(text2);

    if (norm1 === norm2) return 1.0;
    if (norm1.length === 0 || norm2.length === 0) return 0.0;

    // Use Jaccard similarity with word-level tokens
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));

    const intersection = new Set([...words1].filter((word) => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Generate a hash for content comparison
   */
  private generateContentHash(content: string): string {
    // Simple hash function for content comparison
    // Normalize content first to handle minor variations
    const normalized = content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(36);
  }

  /**
   * Remove duplicate segments from content
   */
  private removeSegments(content: string, segmentsToRemove: ContentSegment[]): string {
    if (segmentsToRemove.length === 0) return content;

    // Sort segments by position (descending) to remove from end to beginning
    const sortedSegments = segmentsToRemove.sort((a, b) => b.position - a.position);

    let cleanedContent = content;

    for (const segment of sortedSegments) {
      // Find the segment in the content and remove it
      const segmentIndex = cleanedContent.indexOf(segment.content);
      if (segmentIndex !== -1) {
        cleanedContent =
          cleanedContent.substring(0, segmentIndex) +
          cleanedContent.substring(segmentIndex + segment.content.length);
      }
    }

    // Clean up extra whitespace
    return cleanedContent
      .replace(/\n{3,}/g, '\n\n') // Multiple newlines to double newlines
      .trim();
  }
}
