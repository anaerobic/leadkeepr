/**
 * Shared S3 client utility
 * Provides centralized S3 client creation and configuration
 */

import { S3Client } from '@aws-sdk/client-s3';
import { Tracer } from '@aws-lambda-powertools/tracer';

export interface S3ClientConfig {
  tracer?: Tracer;
  region?: string;
  forcePathStyle?: boolean;
  endpoint?: string;
}

/**
 * Creates an S3 Client with proper tracing and configuration
 * @param config Configuration options for the client
 * @returns Configured S3Client instance
 */
export function createS3Client(config: S3ClientConfig = {}): S3Client {
  const { tracer, region, forcePathStyle, endpoint } = config;

  // Create base S3 client
  const baseClient = new S3Client({
    region,
    forcePathStyle,
    endpoint,
  });

  // Apply tracing if tracer is provided
  return tracer ? tracer.captureAWSv3Client(baseClient) : baseClient;
}

/**
 * Factory class for creating and managing S3 clients
 * Provides caching and singleton behavior
 */
export class S3ClientFactory {
  private static instance: S3ClientFactory;
  private clients: Map<string, S3Client> = new Map();

  private constructor() {}

  public static getInstance(): S3ClientFactory {
    if (!S3ClientFactory.instance) {
      S3ClientFactory.instance = new S3ClientFactory();
    }
    return S3ClientFactory.instance;
  }

  /**
   * Get or create an S3 client with the specified configuration
   * Caches clients based on the configuration hash
   */
  public getClient(config: S3ClientConfig = {}): S3Client {
    const configKey = this.getConfigKey(config);

    if (!this.clients.has(configKey)) {
      const client = createS3Client(config);
      this.clients.set(configKey, client);
    }

    return this.clients.get(configKey)!;
  }

  /**
   * Create a simple configuration key based on the config options
   */
  private getConfigKey(config: S3ClientConfig): string {
    const parts = [
      config.region || 'default',
      config.tracer ? 'traced' : 'untraced',
      config.forcePathStyle ? 'pathStyle' : 'virtualHosted',
      config.endpoint || 'default',
    ];
    return parts.join('-');
  }

  /**
   * Clear all cached clients (useful for testing)
   */
  public clearCache(): void {
    this.clients.clear();
  }
}
