/**
 * Shared patterns for SES email sending operations
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { createSESWrapper } from '../aws';

/**
 * Standard email sending configuration
 */
export interface EmailSendingConfig {
  logger: Logger;
  metrics: Metrics;
  successMetric: string;
  failureMetric: string;
  errorMetric: string;
}

/**
 * Email sending result
 */
export interface EmailSendingResult {
  success: boolean;
  message: string;
  messageId?: string;
}

/**
 * Send email via SES with standardized error handling and metrics
 */
export async function sendEmailWithMetrics(
  sesWrapper: ReturnType<typeof createSESWrapper>,
  config: EmailSendingConfig,
  fromEmail: string,
  toEmails: string[],
  rawEmailContent: string,
  context?: Record<string, any>
): Promise<EmailSendingResult> {
  try {
    const sendResult = await sesWrapper.sendRawEmail(fromEmail, toEmails, rawEmailContent);

    if (!sendResult.success) {
      config.logger.error('Failed to send email via SES', {
        ...context,
        messageId: sendResult.messageId,
      });
      config.metrics.addMetric(config.failureMetric, 'Count', 1);
      
      return {
        success: false,
        message: 'Failed to send email. Please try again later.',
        messageId: sendResult.messageId,
      };
    }

    config.logger.info('Email sent successfully via SES', {
      ...context,
      messageId: sendResult.messageId,
    });
    config.metrics.addMetric(config.successMetric, 'Count', 1);

    return {
      success: true,
      message: 'Email sent successfully.',
      messageId: sendResult.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    config.logger.error('Error sending email via SES', {
      ...context,
      error: errorMessage,
    });
    config.metrics.addMetric(config.errorMetric, 'Count', 1);

    return {
      success: false,
      message: 'An error occurred while sending email.',
    };
  }
}