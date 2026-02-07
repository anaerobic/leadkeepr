import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import OpenAI from 'openai';
import { formatErrorMessage } from '../utils/formatting-utils';

/**
 * Configuration for OpenAI API calls
 */
interface OpenAICallConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  responseFormat?: 'json' | 'text';
}

/**
 * Result from OpenAI API call
 */
interface OpenAIResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Shared service for OpenAI API interactions
 * Provides centralized OpenAI client management and common functionality
 */
export class OpenAIService {
  private readonly openai: OpenAI;

  constructor(
    private readonly logger: Logger,
    private readonly metrics: Metrics,
    private readonly apiKey: string
  ) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Make a chat completion call to OpenAI
   */
  async chatCompletion(config: OpenAICallConfig): Promise<OpenAIResult> {
    const startTime = Date.now();

    try {
      const completion = await this.openai.chat.completions.create({
        model: config.model || 'gpt-4o-mini',
        temperature: config.temperature || 0.1,
        max_tokens: config.maxTokens,
        messages: config.messages,
        ...(config.responseFormat === 'json' && {
          response_format: { type: 'json_object' },
        }),
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response content from OpenAI');
      }

      const result = {
        content: responseContent,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
      };
      this.logger.debug('OpenAI API call succeeded', {
        config,
        duration: Date.now() - startTime,
        result,
      });
      this.metrics.addMetric('OpenAICall', 'Count', 1);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('OpenAI API call failed', {
        error: formatErrorMessage(error),
        duration,
        model: config.model,
      });

      throw error;
    }
  }

  /**
   * Make a structured JSON completion call to OpenAI
   * Automatically sets response format to JSON and validates the response
   */
  async jsonCompletion<T = unknown>(config: Omit<OpenAICallConfig, 'responseFormat'>): Promise<T> {
    const result = await this.chatCompletion({
      ...config,
      responseFormat: 'json',
    });

    try {
      return JSON.parse(result.content) as T;
    } catch (error) {
      this.logger.error('Failed to parse OpenAI JSON response', {
        error: formatErrorMessage(error),
        content: result.content,
      });
      throw new Error('Invalid JSON response from OpenAI');
    }
  }

  /**
   * Convenience method for simple system + user prompts (backwards compatibility)
   */
  async simpleCompletion(config: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'json' | 'text';
  }): Promise<OpenAIResult> {
    return this.chatCompletion({
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: config.userPrompt }
      ],
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      responseFormat: config.responseFormat,
    });
  }

  /**
   * Test OpenAI connectivity and API key validity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.chatCompletion({
        messages: [
          { role: 'system', content: 'You are a test assistant.' },
          { role: 'user', content: 'Say "test successful"' }
        ],
        model: 'gpt-4o-mini',
        maxTokens: 10,
      });
      return true;
    } catch (error) {
      this.logger.error('OpenAI connection test failed', {
        error: formatErrorMessage(error),
      });
      return false;
    }
  }
}
