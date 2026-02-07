/**
 * Shared SES client utility
 * Provides centralized SES client creation and configuration
 */

import { SESClient } from '@aws-sdk/client-ses';
import { Tracer } from '@aws-lambda-powertools/tracer';

export interface SESClientConfig {
  tracer?: Tracer;
  region?: string;
  endpoint?: string;
}

/**
 * Creates an SES Client with proper tracing and configuration
 * @param config Configuration options for the client
 * @returns Configured SESClient instance
 */
export function createSESClient(config: SESClientConfig = {}): SESClient {
  const { tracer, region, endpoint } = config;

  // Create base SES client
  const baseClient = new SESClient({
    region,
    endpoint,
  });

  // Apply tracing if tracer is provided
  return tracer ? tracer.captureAWSv3Client(baseClient) : baseClient;
}

/**
 * Factory class for creating and managing SES clients
 * Provides caching and singleton behavior
 */
export class SESClientFactory {
  private static instance: SESClientFactory;
  private clients: Map<string, SESClient> = new Map();

  private constructor() {}

  public static getInstance(): SESClientFactory {
    if (!SESClientFactory.instance) {
      SESClientFactory.instance = new SESClientFactory();
    }
    return SESClientFactory.instance;
  }

  /**
   * Get or create an SES client with the specified configuration
   * Caches clients based on the configuration hash
   */
  public getClient(config: SESClientConfig = {}): SESClient {
    const configKey = this.getConfigKey(config);

    if (!this.clients.has(configKey)) {
      const client = createSESClient(config);
      this.clients.set(configKey, client);
    }

    return this.clients.get(configKey)!;
  }

  /**
   * Create a simple configuration key based on the config options
   */
  private getConfigKey(config: SESClientConfig): string {
    const parts = [
      config.region || 'default',
      config.tracer ? 'traced' : 'untraced',
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
