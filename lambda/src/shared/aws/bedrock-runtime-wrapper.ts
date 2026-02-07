/**
 * Standardized Bedrock Runtime operations wrapper with consistent error handling and metrics
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  AwsWrapperConfig,
  createAwsOperationExecutor,
  createAwsMetricsHelper,
} from './wrapper-base';

export interface BedrockRuntimeOperationConfig extends AwsWrapperConfig {
  defaultModelId?: string;
}

/**
 * Bedrock Runtime operation result
 */
export interface BedrockInvokeResult {
  body: Uint8Array;
  contentType?: string;
}

/**
 * Standardized Bedrock Runtime operations wrapper
 */
export function createBedrockRuntimeWrapper(
  client: BedrockRuntimeClient,
  config: BedrockRuntimeOperationConfig
) {
  const executeBedrockOperation = createAwsOperationExecutor('BedrockRuntime', config);
  const standardMetrics = createAwsMetricsHelper(config);

  return {
    /**
     * Invoke a Bedrock model with the given request body
     */
    async invokeModel(
      requestBody: Record<string, unknown>,
      options?: {
        modelId?: string;
        contentType?: string;
        accept?: string;
      }
    ): Promise<BedrockInvokeResult> {
      const modelId = options?.modelId || config.defaultModelId;
      if (!modelId) {
        throw new Error('Model ID must be provided either in options or config');
      }

      const result = await executeBedrockOperation(
        async () => {
          const command = new InvokeModelCommand({
            modelId,
            contentType: options?.contentType || 'application/json',
            accept: options?.accept || 'application/json',
            body: JSON.stringify(requestBody),
          });

          const response = await client.send(command);

          // Track request and response sizes
          const requestSize = JSON.stringify(requestBody).length;
          const responseSize = response.body?.length || 0;

          standardMetrics?.addSize('BedrockInvokeRequest', requestSize);
          standardMetrics?.addSize('BedrockInvokeResponse', responseSize);

          return {
            body: response.body!,
            contentType: response.contentType,
          };
        },
        'InvokeModel',
        {
          modelId,
          contentType: options?.contentType || 'application/json',
        }
      );

      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    },

    /**
     * Helper method for text-based embedding models
     */
    async generateEmbeddings(
      inputText: string,
      options?: {
        modelId?: string;
      }
    ): Promise<number[]> {
      const modelId = options?.modelId || config.defaultModelId;
      if (!modelId) {
        throw new Error('Model ID must be provided either in options or config');
      }

      const requestBody = this.prepareEmbeddingRequestBody(inputText, modelId);
      const response = await this.invokeModel(requestBody, { modelId });

      // Parse response and extract embeddings
      const responseText = new TextDecoder().decode(response.body);
      const responseBody = JSON.parse(responseText);
      const embedding = this.extractEmbedding(responseBody, modelId);

      if (!embedding || embedding.length === 0) {
        throw new Error('No embedding returned from Bedrock model');
      }

      standardMetrics?.addCount('BedrockEmbeddingDimensions', embedding.length);
      return embedding;
    },

    /**
     * Prepare request body based on embedding model type
     */
    prepareEmbeddingRequestBody(inputText: string, modelId: string): Record<string, unknown> {
      if (modelId.startsWith('amazon.titan-embed')) {
        // Amazon Titan Embedding model format
        return {
          inputText,
        };
      } else if (modelId.startsWith('cohere.embed')) {
        // Cohere Embedding model format
        return {
          texts: [inputText],
          input_type: 'search_document',
        };
      } else {
        // Default to Titan format
        return {
          inputText,
        };
      }
    },

    /**
     * Extract embedding vector from Bedrock response
     */
    extractEmbedding(responseBody: Record<string, unknown>, modelId: string): number[] {
      if (modelId.startsWith('amazon.titan-embed')) {
        return responseBody.embedding as number[];
      } else if (modelId.startsWith('cohere.embed')) {
        const embeddings = responseBody.embeddings as number[][];
        return embeddings?.[0] || [];
      } else {
        // Default to Titan format
        return responseBody.embedding as number[];
      }
    },
  };
}

/**
 * Factory function for Bedrock Runtime wrapper creation with default model pre-configured
 */
export function createBedrockRuntimeWrapperFactory(
  client: BedrockRuntimeClient,
  baseConfig: AwsWrapperConfig
) {
  return (defaultModelId?: string) =>
    createBedrockRuntimeWrapper(client, { ...baseConfig, defaultModelId });
}
