/**
 * Utility functions for standardized metrics collection patterns
 * Consolidates common metrics patterns used across Lambda functions
 */

import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

/**
 * Configuration for metrics collection
 */
export interface MetricsConfig {
  metrics: Metrics;
  prefix?: string; // Optional prefix for all metrics
  namespace?: string; // Optional namespace override
}

/**
 * Standard metrics for Lambda operations
 */
export class StandardMetrics {
  constructor(private readonly config: MetricsConfig) {}

  /**
   * Add a processing success metric
   */
  addProcessingSuccess(operation: string, count: number = 1): void {
    this.addMetric(`${operation}Success`, MetricUnit.Count, count);
  }

  /**
   * Add a processing error metric
   */
  addProcessingError(operation: string, count: number = 1): void {
    this.addMetric(`${operation}Error`, MetricUnit.Count, count);
  }

  /**
   * Add a duration metric
   */
  addDuration(operation: string, duration: number): void {
    this.addMetric(`${operation}Duration`, MetricUnit.Milliseconds, duration);
  }

  /**
   * Add a size metric
   */
  addSize(
    operation: string,
    size: number,
    unit: (typeof MetricUnit)[keyof typeof MetricUnit] = MetricUnit.Bytes
  ): void {
    this.addMetric(`${operation}Size`, unit, size);
  }

  /**
   * Add a count metric
   */
  addCount(operation: string, count: number): void {
    this.addMetric(`${operation}Count`, MetricUnit.Count, count);
  }

  /**
   * Add a percentage metric
   */
  addPercentage(operation: string, percentage: number): void {
    this.addMetric(`${operation}Percentage`, MetricUnit.Percent, percentage);
  }

  /**
   * Add AWS service call metrics
   */
  addAwsServiceCall(
    serviceName: string,
    operation: string,
    success: boolean,
    duration?: number
  ): void {
    const metricName = `${serviceName}${operation}`;

    if (success) {
      this.addProcessingSuccess(metricName);
    } else {
      this.addProcessingError(metricName);
    }

    if (duration !== undefined) {
      this.addDuration(metricName, duration);
    }
  }

  /**
   * Add batch processing metrics
   */
  addBatchMetrics(operation: string, total: number, processed: number, errors: number): void {
    this.addCount(`${operation}Total`, total);
    this.addCount(`${operation}Processed`, processed);
    this.addCount(`${operation}Errors`, errors);

    if (total > 0) {
      this.addPercentage(`${operation}SuccessRate`, (processed / total) * 100);
    }
  }

  /**
   * Add Lambda cold start metric
   */
  addColdStart(): void {
    this.addMetric('ColdStart', MetricUnit.Count, 1);
  }

  /**
   * Add API response time metric
   */
  addApiResponseTime(endpoint: string, duration: number, statusCode?: number): void {
    this.addDuration(`API${endpoint}ResponseTime`, duration);

    if (statusCode) {
      this.addCount(`API${endpoint}Status${statusCode}`, 1);
    }
  }

  /**
   * Add record processing metrics (for SQS, DynamoDB streams, etc.)
   */
  addRecordProcessingMetrics(
    recordType: string,
    receivedCount: number,
    processedCount: number,
    errorCount: number = 0
  ): void {
    this.addCount(`${recordType}RecordsReceived`, receivedCount);
    this.addCount(`${recordType}RecordsProcessed`, processedCount);

    if (errorCount > 0) {
      this.addCount(`${recordType}RecordsError`, errorCount);
    }
  }

  /**
   * Add OpenAI API metrics
   */
  addOpenAIMetrics(
    success: boolean,
    duration: number,
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }
  ): void {
    this.addAwsServiceCall('OpenAI', 'ApiCall', success, duration);

    if (usage) {
      this.addCount('OpenAIPromptTokens', usage.promptTokens);
      this.addCount('OpenAICompletionTokens', usage.completionTokens);
      this.addCount('OpenAITotalTokens', usage.totalTokens);
    }
  }

  /**
   * Add email processing metrics
   */
  addEmailMetrics(
    operation: string,
    success: boolean,
    emailSize?: number,
    attachmentCount?: number
  ): void {
    if (success) {
      this.addProcessingSuccess(`Email${operation}`);
    } else {
      this.addProcessingError(`Email${operation}`);
    }

    if (emailSize !== undefined) {
      this.addSize(`Email${operation}`, emailSize);
    }

    if (attachmentCount !== undefined) {
      this.addCount(`Email${operation}Attachments`, attachmentCount);
    }
  }

  /**
   * Add storage operation metrics
   */
  addStorageMetrics(
    storageType: string, // 'S3', 'DynamoDB', etc.
    operation: string, // 'Store', 'Retrieve', etc.
    success: boolean,
    itemSize?: number,
    duration?: number
  ): void {
    this.addAwsServiceCall(storageType, operation, success, duration);

    if (itemSize !== undefined) {
      this.addSize(`${storageType}${operation}Item`, itemSize);
    }
  }

  /**
   * Add processing pipeline metrics
   */
  addPipelineMetrics(
    pipelineName: string,
    stages: Array<{ name: string; success: boolean; duration?: number }>
  ): void {
    let totalDuration = 0;
    let successCount = 0;

    for (const stage of stages) {
      const stageName = `${pipelineName}${stage.name}`;

      if (stage.success) {
        this.addProcessingSuccess(stageName);
        successCount++;
      } else {
        this.addProcessingError(stageName);
      }

      if (stage.duration !== undefined) {
        this.addDuration(stageName, stage.duration);
        totalDuration += stage.duration;
      }
    }

    // Overall pipeline metrics
    this.addDuration(`${pipelineName}Total`, totalDuration);
    this.addPercentage(`${pipelineName}SuccessRate`, (successCount / stages.length) * 100);
  }

  /**
   * Helper method to add metrics with optional prefix
   */
  private addMetric(
    name: string,
    unit: (typeof MetricUnit)[keyof typeof MetricUnit],
    value: number
  ): void {
    const metricName = this.config.prefix ? `${this.config.prefix}${name}` : name;
    this.config.metrics.addMetric(metricName, unit, value);
  }
}

/**
 * Create a StandardMetrics instance
 */
export function createStandardMetrics(config: MetricsConfig): StandardMetrics {
  return new StandardMetrics(config);
}
