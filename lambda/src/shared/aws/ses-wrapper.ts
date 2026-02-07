/**
 * Standardized SES operations wrapper with consistent error handling and metrics
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { SESClient, SendRawEmailCommand, VerifyEmailIdentityCommand } from '@aws-sdk/client-ses';
import {
  AwsWrapperConfig,
  createAwsOperationExecutor,
  createAwsMetricsHelper,
} from './wrapper-base';

/**
 * Standardized SES operations wrapper
 */
export function createSESWrapper(client: SESClient, config: AwsWrapperConfig) {
  const executeSESOperation = createAwsOperationExecutor('SES', config);
  const standardMetrics = createAwsMetricsHelper(config);

  return {
    async sendRawEmail(
      source: string,
      destinations: string[],
      rawMessage: string,
      configurationSetName?: string
    ): Promise<{ messageId?: string; success: boolean }> {
      const result = await executeSESOperation(
        async () => {
          const command = new SendRawEmailCommand({
            Source: source,
            Destinations: destinations,
            RawMessage: {
              Data: new TextEncoder().encode(rawMessage),
            },
            ...(configurationSetName && { ConfigurationSetName: configurationSetName }),
          });

          const response = await client.send(command);

          standardMetrics?.addSize('SESSendRawEmail', rawMessage.length);
          standardMetrics?.addCount('SESRecipients', destinations.length);

          return {
            messageId: response.MessageId,
            success: true,
          };
        },
        'SendRawEmail',
        {
          source,
          destinationCount: destinations.length,
          destinations: destinations.join(', '),
          emailSize: rawMessage.length,
          configurationSetName: configurationSetName || 'none',
        }
      );

      if (!result.success) {
        return { success: false };
      }

      return result.data || { success: false };
    },

    async verifyEmailIdentity(emailAddress: string): Promise<{ success: boolean }> {
      const result = await executeSESOperation(
        async () => {
          const command = new VerifyEmailIdentityCommand({
            EmailAddress: emailAddress,
          });

          await client.send(command);

          standardMetrics?.addCount('SESEmailIdentityVerifications', 1);

          return {
            success: true,
          };
        },
        'VerifyEmailIdentity',
        {
          emailAddress,
        }
      );

      if (!result.success) {
        return { success: false };
      }

      return result.data || { success: false };
    },
  };
}

/**
 * Factory function for SES wrapper creation with base configuration
 */
export function createSESWrapperFactory(client: SESClient, baseConfig: AwsWrapperConfig) {
  return () => createSESWrapper(client, baseConfig);
}
