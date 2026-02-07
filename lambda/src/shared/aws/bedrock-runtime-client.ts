/**
 * Bedrock Runtime client utility
 * Provides centralized Bedrock Runtime client creation and configuration
 */

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { Tracer } from '@aws-lambda-powertools/tracer';

export interface BedrockRuntimeClientConfig {
  tracer?: Tracer;
  region?: string;
}

/**
 * Creates a Bedrock Runtime Client with proper tracing and configuration
 * @param config Configuration options for the client
 * @returns Configured BedrockRuntimeClient instance
 */
export function createBedrockRuntimeClient(
  config: BedrockRuntimeClientConfig = {}
): BedrockRuntimeClient {
  const { tracer, region } = config;

  // Create base Bedrock Runtime client
  const baseClient = new BedrockRuntimeClient({
    region,
  });

  // Apply tracing if tracer is provided
  return tracer ? tracer.captureAWSv3Client(baseClient) : baseClient;
}

/**
 * Factory class for creating and managing Bedrock Runtime clients
 * Provides caching and singleton behavior
 */
export class BedrockRuntimeClientFactory {
  private static instance: BedrockRuntimeClientFactory;
  private clients: Map<string, BedrockRuntimeClient> = new Map();

  private constructor() {}

  public static getInstance(): BedrockRuntimeClientFactory {
    if (!BedrockRuntimeClientFactory.instance) {
      BedrockRuntimeClientFactory.instance = new BedrockRuntimeClientFactory();
    }
    return BedrockRuntimeClientFactory.instance;
  }

  /**
   * Get or create a Bedrock Runtime client with the specified configuration
   * Caches clients based on the configuration hash
   */
  public getClient(config: BedrockRuntimeClientConfig = {}): BedrockRuntimeClient {
    const configKey = this.getConfigKey(config);

    if (!this.clients.has(configKey)) {
      const client = createBedrockRuntimeClient(config);
      this.clients.set(configKey, client);
    }

    return this.clients.get(configKey)!;
  }

  /**
   * Create a simple configuration key based on the config options
   */
  private getConfigKey(config: BedrockRuntimeClientConfig): string {
    const parts = [config.region || 'default', config.tracer ? 'traced' : 'untraced'];
    return parts.join('-');
  }

  /**
   * Clear all cached clients (useful for testing)
   */
  public clearCache(): void {
    this.clients.clear();
  }
}
