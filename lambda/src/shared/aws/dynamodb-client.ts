/**
 * Shared DynamoDB client utility
 * Provides centralized DynamoDB client creation and configuration
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Tracer } from '@aws-lambda-powertools/tracer';

export interface DynamoDBClientConfig {
  tracer?: Tracer;
  region?: string;
  marshallOptions?: {
    removeUndefinedValues?: boolean;
    convertEmptyValues?: boolean;
    convertClassInstanceToMap?: boolean;
  };
  unmarshallOptions?: {
    wrapNumbers?: boolean;
  };
}

/**
 * Creates a DynamoDB Document Client with proper tracing and configuration
 * @param config Configuration options for the client
 * @returns Configured DynamoDBDocumentClient instance
 */
export function createDynamoDBClient(config: DynamoDBClientConfig = {}): DynamoDBDocumentClient {
  const { tracer, region, marshallOptions, unmarshallOptions } = config;

  // Create base DynamoDB client
  const baseClient = new DynamoDBClient({
    region,
  });

  // Apply tracing if tracer is provided
  const tracedClient = tracer ? tracer.captureAWSv3Client(baseClient) : baseClient;

  // Create document client with default options
  const documentClient = DynamoDBDocumentClient.from(tracedClient, {
    marshallOptions: {
      removeUndefinedValues: true,
      ...marshallOptions,
    },
    unmarshallOptions,
  });

  return documentClient;
}

/**
 * Factory class for creating and managing DynamoDB clients
 * Provides caching and singleton behavior
 */
export class DynamoDBClientFactory {
  private static instance: DynamoDBClientFactory;
  private clients: Map<string, DynamoDBDocumentClient> = new Map();

  private constructor() {}

  public static getInstance(): DynamoDBClientFactory {
    if (!DynamoDBClientFactory.instance) {
      DynamoDBClientFactory.instance = new DynamoDBClientFactory();
    }
    return DynamoDBClientFactory.instance;
  }

  /**
   * Get or create a DynamoDB client with the specified configuration
   * Caches clients based on the configuration hash
   */
  public getClient(config: DynamoDBClientConfig = {}): DynamoDBDocumentClient {
    const configKey = this.getConfigKey(config);

    if (!this.clients.has(configKey)) {
      const client = createDynamoDBClient(config);
      this.clients.set(configKey, client);
    }

    return this.clients.get(configKey)!;
  }

  /**
   * Create a simple configuration key based on the config options
   */
  private getConfigKey(config: DynamoDBClientConfig): string {
    const parts = [
      config.region || 'default',
      config.tracer ? 'traced' : 'untraced',
      config.marshallOptions?.removeUndefinedValues ? 'removeUndefined' : 'keepUndefined',
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
