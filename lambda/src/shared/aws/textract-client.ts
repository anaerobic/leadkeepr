/**
 * AWS Textract client factory with standardized configuration
 * Provides consistent Textract client creation with observability
 */

import {
  TextractClient,
  TextractClientConfig as AWSTextractClientConfig,
} from '@aws-sdk/client-textract';
import { captureAWSv3Client } from 'aws-xray-sdk-core';
import { Tracer } from '@aws-lambda-powertools/tracer';

export interface TextractClientConfig {
  /**
   * AWS region for the Textract client
   */
  region?: string;

  /**
   * Custom endpoint for testing or local development
   */
  endpoint?: string;

  /**
   * X-Ray tracer for observability
   */
  tracer?: Tracer;
}

/**
 * Create a configured Textract client with observability
 * @param config Configuration options for the client
 * @returns Configured TextractClient instance
 */
export function createTextractClient(config: TextractClientConfig = {}): TextractClient {
  const { tracer, region, endpoint } = config;

  // Create base Textract client
  const baseClient = new TextractClient({
    region,
    endpoint,
  } as AWSTextractClientConfig);

  // Apply X-Ray tracing if tracer provided
  if (tracer) {
    return captureAWSv3Client(baseClient);
  }

  return baseClient;
}

/**
 * Default Textract client configuration
 */
export const DEFAULT_TEXTRACT_CONFIG: TextractClientConfig = {
  region: process.env.AWS_REGION || 'us-west-2',
};

/**
 * Create Textract client with default configuration
 * Convenience function for common use cases
 */
export function createDefaultTextractClient(tracer?: Tracer): TextractClient {
  return createTextractClient({
    ...DEFAULT_TEXTRACT_CONFIG,
    tracer,
  });
}
