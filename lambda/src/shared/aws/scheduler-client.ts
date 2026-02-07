/**
 * Shared EventBridge Scheduler client utility
 * Provides centralized scheduler client creation and configuration
 */

import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { Tracer } from '@aws-lambda-powertools/tracer';

export interface SchedulerClientConfig {
  tracer?: Tracer;
  region?: string;
  endpoint?: string;
}

/**
 * Creates a Scheduler Client with proper tracing and configuration
 * @param config Configuration options for the client
 * @returns Configured SchedulerClient instance
 */
export function createSchedulerClient(config: SchedulerClientConfig = {}): SchedulerClient {
  const { tracer, region, endpoint } = config;

  // Create base Scheduler client
  const baseClient = new SchedulerClient({
    region,
    endpoint,
  });

  // Apply tracing if tracer is provided
  return tracer ? tracer.captureAWSv3Client(baseClient) : baseClient;
}

/**
 * Factory class for creating and managing Scheduler clients
 * Provides caching and singleton behavior
 */
export class SchedulerClientFactory {
  private static instance: SchedulerClientFactory;
  private clients: Map<string, SchedulerClient> = new Map();

  private constructor() {}

  public static getInstance(): SchedulerClientFactory {
    if (!SchedulerClientFactory.instance) {
      SchedulerClientFactory.instance = new SchedulerClientFactory();
    }
    return SchedulerClientFactory.instance;
  }

  /**
   * Get or create a Scheduler client with the specified configuration
   * Caches clients based on the configuration hash
   */
  public getClient(config: SchedulerClientConfig = {}): SchedulerClient {
    const configKey = this.getConfigKey(config);

    if (!this.clients.has(configKey)) {
      const client = createSchedulerClient(config);
      this.clients.set(configKey, client);
    }

    return this.clients.get(configKey)!;
  }

  /**
   * Create a simple configuration key based on the config options
   */
  private getConfigKey(config: SchedulerClientConfig): string {
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
