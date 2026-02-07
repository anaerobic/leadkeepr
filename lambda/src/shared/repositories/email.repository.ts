/**
 * Shared email repository for storing and retrieving email thread context
 * Used by both email-handler and vector-embeddings-processor
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { DynamoDBWrapper } from '../aws';
import { IncomingEmailParsed, EmailIntentAnalysis, EmailRecord, DDB_PREFIXES } from '../../types';
import { determineThreadId } from '../utils/threading';
import { sanitizeEmailAddress } from '../utils/email-addresses';

/**
 * Parameters for creating email records
 */
export interface CreateEmailRecordParams {
  parsedEmail: IncomingEmailParsed;
  s3Key: string;
  completeEmailContent: string;
  emailIntentAnalysis: EmailIntentAnalysis;
}

/**
 * Thread context for AI analysis
 */
export interface EmailThreadContext {
  threadId: string;
  emails: EmailRecord[];
  chronologicalOrder: boolean; // true if emails are in date order
}

export class EmailRepository {
  constructor(
    private readonly dbWrapper: DynamoDBWrapper,
    private readonly logger: Logger
  ) {}

  /**
   * Store a new email record
   */
  async storeEmail(params: CreateEmailRecordParams): Promise<EmailRecord> {
    const { parsedEmail, s3Key, completeEmailContent, emailIntentAnalysis } = params;

    // Determine thread ID: use references/inReplyTo headers or this message's ID as thread root
    const threadId = determineThreadId(parsedEmail);

    const now = new Date().toISOString();
    const sanitizedSender = sanitizeEmailAddress(parsedEmail.from);

    const record: EmailRecord = {
      pk: sanitizedSender,
      sk: `${DDB_PREFIXES.EMAIL}${parsedEmail.emailDate}#${parsedEmail.messageId}`,
      gsi1Pk: `${sanitizedSender}#${threadId}`,
      gsi1Sk: `${parsedEmail.emailDate}#${parsedEmail.messageId}`,

      messageId: parsedEmail.messageId,
      from: parsedEmail.from,
      to: parsedEmail.to,
      cc: parsedEmail.cc,
      bcc: parsedEmail.bcc,
      replyTo: parsedEmail.replyTo,
      subject: parsedEmail.subject,
      emailDate: parsedEmail.emailDate,
      s3Key,

      inReplyTo: parsedEmail.inReplyTo,
      references: Array.isArray(parsedEmail.references)
        ? parsedEmail.references.join(' ')
        : parsedEmail.references || '',
      threadId,
      isReplyToOurEmail: emailIntentAnalysis.isReplyToOurEmail,

      completeEmailContent,
      emailIntentAnalysis,

      hasAttachments: parsedEmail.attachments.length > 0,
      attachmentCount: parsedEmail.attachments.length,

      createdAt: now,
      updatedAt: now,
    };

    try {
      this.logger.debug('Storing email record in DynamoDB', {
        messageId: parsedEmail.messageId,
        pk: record.pk,
        sk: record.sk,
        threadId,
        gsi1Pk: record.gsi1Pk,
        isReplyToOurEmail: emailIntentAnalysis.isReplyToOurEmail,
        hasAttachments: record.hasAttachments,
        attachmentCount: record.attachmentCount,
      });

      await this.dbWrapper.putItem(record);

      this.logger.debug('Email record stored successfully in DynamoDB', {
        messageId: parsedEmail.messageId,
        threadId,
        isReplyToOurEmail: emailIntentAnalysis.isReplyToOurEmail,
      });

      return record;
    } catch (error) {
      this.logger.error('Failed to store email record in DynamoDB', {
        messageId: parsedEmail.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get thread context using email data
   * This works for both emails not yet stored (IncomingEmailParsed) and stored emails (EmailRecord)
   * 
   * Simple approach: Determine threadId using same logic as storeEmail, then query once
   */
  async getThreadContext(
    email: IncomingEmailParsed | EmailRecord
  ): Promise<EmailThreadContext | null> {
    try {
      let sanitizedSender: string;
      let threadId: string;

      // Handle both IncomingEmailParsed and EmailRecord
      if ('pk' in email) {
        // This is an EmailRecord - use existing pk and threadId
        sanitizedSender = email.pk;
        threadId = email.threadId;
      } else {
        // This is IncomingEmailParsed - determine values from headers
        sanitizedSender = sanitizeEmailAddress(email.from);
        threadId = determineThreadId(email);
      }

      const gsi1Pk = `${sanitizedSender}#${threadId}`;
      
      this.logger.debug('Querying for thread emails', {
        messageId: email.messageId,
        gsi1Pk,
        threadId,
        senderEmail: sanitizedSender,
      });

      // Query for all emails in this thread using GSI1 (gsi1Pk = threadId_senderEmail)
      const queryStartTime = Date.now();
      const threadEmails = await this.dbWrapper.query<EmailRecord>(
        'gsi1Pk = :gsi1Pk',
        { ':gsi1Pk': gsi1Pk },
        {
          indexName: 'GSI1',
          scanIndexForward: true,
        }
      );
      const queryDuration = Date.now() - queryStartTime;

      this.logger.debug('Thread email query completed', {
        messageId: email.messageId,
        threadId,
        emailsFound: threadEmails.length,
        queryDurationMs: queryDuration,
      });

      if (threadEmails.length > 0) {
        // Sort by actual date for chronological order
        const sortedEmails = threadEmails.sort((a, b) => {
          const dateA = new Date(a.emailDate).getTime();
          const dateB = new Date(b.emailDate).getTime();
          return dateA - dateB; // Oldest first
        });

        return {
          threadId,
          emails: sortedEmails,
          chronologicalOrder: true,
        };
      }

      // No existing emails in this thread found (this could be the first email we're seeing)
      return null;
    } catch (error) {
      this.logger.error('Failed to get thread context', {
        messageId: email.messageId,
        inReplyTo: 'inReplyTo' in email ? email.inReplyTo : undefined,
        references: 'references' in email ? email.references : undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get all emails in a thread by gsi1Pk, ordered chronologically
   */
  async getEmailsByThreadId(gsi1Pk: string): Promise<EmailRecord[]> {
    try {
      const results = await this.dbWrapper.query<EmailRecord>(
        'gsi1Pk = :gsi1Pk',
        { ':gsi1Pk': gsi1Pk },
        {
          indexName: 'GSI1',
          scanIndexForward: true, // Chronological order (oldest first)
        }
      );

      // Sort results by actual date since GSI1 sort key doesn't handle mixed timezone formats correctly
      return results.sort((a, b) => {
        const dateA = new Date(a.emailDate).getTime();
        const dateB = new Date(b.emailDate).getTime();
        return dateA - dateB; // Oldest first
      });
    } catch (error) {
      this.logger.error('Failed to get emails by gsi1Pk', {
        gsi1Pk,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

}
