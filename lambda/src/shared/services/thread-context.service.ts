/**
 * Thread Context Service
 *
 * Provides thread context retrieval functionality that can be used by composition
 * instead of coupling to specific analyzer interfaces.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { EmailRepository } from '../repositories/email.repository';
import { EmailRecord, IncomingEmailParsed } from '../../types';

export interface ThreadContext {
  threadId: string;
  emails: EmailRecord[];
}

export class ThreadContextService {
  constructor(
    private readonly emailRepository: EmailRepository,
    private readonly logger: Logger
  ) {}

  /**
   * Get thread context for an email if it's a reply
   */
  async getThreadContext(parsedEmail: IncomingEmailParsed): Promise<ThreadContext | null> {
    const startTime = Date.now();
    
    // If this email has reply headers, try to get thread context
    if (!parsedEmail.inReplyTo && !parsedEmail.references) {
      this.logger.debug('No reply headers found, skipping thread context retrieval', {
        messageId: parsedEmail.messageId,
      });
      return null;
    }

    this.logger.debug('Starting thread context retrieval', {
      messageId: parsedEmail.messageId,
      inReplyTo: parsedEmail.inReplyTo,
      hasReferences: !!(parsedEmail.references && parsedEmail.references.length > 0),
    });

    try {
      // Use the repository method that works with email headers
      const threadContext = await this.emailRepository.getThreadContext(parsedEmail);
      const duration = Date.now() - startTime;

      if (threadContext) {
        this.logger.debug('Thread context retrieved successfully', {
          messageId: parsedEmail.messageId,
          threadId: threadContext.threadId,
          emailCount: threadContext.emails.length,
          durationMs: duration,
        });
        return threadContext;
      }

      this.logger.debug('No thread context found', {
        messageId: parsedEmail.messageId,
        durationMs: duration,
      });
      return null;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to retrieve thread context', {
        messageId: parsedEmail.messageId,
        inReplyTo: parsedEmail.inReplyTo,
        durationMs: duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Create structured thread context for AI analysis
   */
  createStructuredThreadContext(threadContext: ThreadContext): string {
    if (!threadContext || threadContext.emails.length === 0) {
      return '';
    }

    let contextData = 'THREAD CONTEXT DATA FOR CANCELLATION/UPDATE DETECTION:\n\n';

    threadContext.emails.forEach((email, index) => {
      contextData += `--- Email ${index + 1} (${email.messageId}) ---\n`;
      contextData += `From: ${email.from}\n`;
      contextData += `Date: ${email.emailDate}\n`;
      contextData += `Subject: ${email.subject || 'No subject'}\n`;

      // Include the actual email content so AI can reference previous details
      if (email.completeEmailContent) {
        contextData += `Content: ${email.completeEmailContent.substring(0, 500)}${email.completeEmailContent.length > 500 ? '...' : ''}\n`;
      }

      if (email.emailIntentAnalysis) {
        const analysis = email.emailIntentAnalysis;

        // Include reminders with their UIDs and status
        if (analysis.reminders && analysis.reminders.length > 0) {
          contextData += '\nReminder Requests:\n';
          analysis.reminders.forEach(
            (reminder: {
              contextualTitle: string;
              dateTime: string;
              uid?: string;
              text: string;
              status?: string;
              cancelledAt?: string;
              cancellationReason?: string;
            }) => {
              const statusTag = reminder.status ? ` [${reminder.status.toUpperCase()}]` : '';
              contextData += `- Title: ${reminder.contextualTitle}${statusTag}\n`;
              contextData += `  DateTime: ${reminder.dateTime}\n`;
              if (reminder.uid) {
                contextData += `  UID: ${reminder.uid}\n`;
              }
              contextData += `  Text: ${reminder.text}\n`;
              if (reminder.status === 'cancelled' && reminder.cancelledAt) {
                contextData += `  Cancelled: ${reminder.cancelledAt}\n`;
                if (reminder.cancellationReason) {
                  contextData += `  Reason: ${reminder.cancellationReason}\n`;
                }
              }
            }
          );
        }

        // Include reply body for context
        if (analysis.replyBody) {
          contextData += `\nReply sent: ${analysis.replyBody.substring(0, 200)}${analysis.replyBody.length > 200 ? '...' : ''}\n`;
        }
      }

      contextData += '\n';
    });

    return contextData;
  }

  /**
   * Create human-readable thread summary for preferences analysis
   */
  createHumanReadableThreadSummary(threadContext: ThreadContext): string {
    if (!threadContext || threadContext.emails.length === 0) {
      return '';
    }

    let summary = `PREVIOUS CONVERSATION CONTEXT (${threadContext.emails.length} emails):\n\n`;

    threadContext.emails.forEach((email, index) => {
      summary += `${index + 1}. Email from ${email.from} on ${email.emailDate}\n`;
      summary += `   Subject: ${email.subject || 'No subject'}\n`;

      if (email.emailIntentAnalysis?.summary) {
        summary += `   Summary: ${email.emailIntentAnalysis.summary}\n`;
      }

      if (
        email.emailIntentAnalysis?.keyInsights &&
        email.emailIntentAnalysis.keyInsights.length > 0
      ) {
        summary += `   Key insights: ${email.emailIntentAnalysis.keyInsights.join(', ')}\n`;
      }

      summary += '\n';
    });

    return summary;
  }
}
