/**
 * Shared SNS client utility
 * Provides centralized SNS client creation and configuration
 */

import { SNSClient } from '@aws-sdk/client-sns';
import { Tracer } from '@aws-lambda-powertools/tracer';

export interface SNSClientConfig {
  tracer?: Tracer;
  region?: string;
  endpoint?: string;
}

/**
 * Creates an SNS Client with proper tracing and configuration
 * @param config Configuration options for the client
 * @returns Configured SNSClient instance
 */
export function createSNSClient(config: SNSClientConfig = {}): SNSClient {
  const clientConfig: any = {
    region: config.region || process.env.AWS_REGION || 'us-west-2',
  };

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }

  const client = new SNSClient(clientConfig);

  // Add tracing if provided
  if (config.tracer) {
    config.tracer.captureAWSv3Client(client);
  }

  return client;
}
