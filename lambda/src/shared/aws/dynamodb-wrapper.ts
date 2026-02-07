/**
 * Standardized DynamoDB operations wrapper with consistent error handling and metrics
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  AwsWrapperConfig,
  createAwsOperationExecutor,
  createAwsMetricsHelper,
} from './wrapper-base';

export interface DynamoDBOperationConfig extends AwsWrapperConfig {
  tableName: string;
}

/**
 * Type definition for DynamoDB wrapper interface
 */
export type DynamoDBWrapper = ReturnType<typeof createDynamoDBWrapper>;

/**
 * Standardized DynamoDB operations wrapper
 */
export function createDynamoDBWrapper(
  client: DynamoDBDocumentClient,
  config: DynamoDBOperationConfig
) {
  const executeDynamoDBOperation = createAwsOperationExecutor('DynamoDB', config);
  const standardMetrics = createAwsMetricsHelper(config);

  return {
    async getItem<T = Record<string, unknown>>(key: Record<string, unknown>): Promise<T | null> {
      const result = await executeDynamoDBOperation(
        async () => {
          const command = new GetCommand({
            TableName: config.tableName,
            Key: key,
          });
          const response = await client.send(command);
          return (response.Item as T) || null;
        },
        'GetItem',
        { keyFields: Object.keys(key), tableName: config.tableName }
      );

      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    },

    async putItem<T = Record<string, unknown>>(
      item: T,
      conditionExpression?: string
    ): Promise<void> {
      const result = await executeDynamoDBOperation(
        async () => {
          const command = new PutCommand({
            TableName: config.tableName,
            Item: item as Record<string, unknown>,
            ConditionExpression: conditionExpression,
          });
          await client.send(command);

          const itemSize = JSON.stringify(item).length;
          standardMetrics?.addSize('DynamoDBPutItem', itemSize);
        },
        'PutItem',
        { hasCondition: !!conditionExpression, tableName: config.tableName }
      );

      if (!result.success) {
        throw result.error;
      }
    },

    async updateItem(
      key: Record<string, unknown>,
      updateExpression: string,
      expressionAttributeValues?: Record<string, unknown>,
      expressionAttributeNames?: Record<string, string>
    ): Promise<void> {
      const result = await executeDynamoDBOperation(
        async () => {
          const command = new UpdateCommand({
            TableName: config.tableName,
            Key: key,
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames: expressionAttributeNames,
          });
          await client.send(command);
        },
        'UpdateItem',
        { keyFields: Object.keys(key), tableName: config.tableName }
      );

      if (!result.success) {
        throw result.error;
      }
    },

    async deleteItem(key: Record<string, unknown>): Promise<void> {
      const result = await executeDynamoDBOperation(
        async () => {
          const command = new DeleteCommand({
            TableName: config.tableName,
            Key: key,
          });
          await client.send(command);
        },
        'DeleteItem',
        { keyFields: Object.keys(key), tableName: config.tableName }
      );

      if (!result.success) {
        throw result.error;
      }
    },

    async query<T = Record<string, unknown>>(
      keyConditionExpression: string,
      expressionAttributeValues: Record<string, unknown>,
      options?: {
        filterExpression?: string;
        indexName?: string;
        limit?: number;
        scanIndexForward?: boolean;
        expressionAttributeNames?: Record<string, string>;
      }
    ): Promise<T[]> {
      const result = await executeDynamoDBOperation(
        async () => {
          const command = new QueryCommand({
            TableName: config.tableName,
            KeyConditionExpression: keyConditionExpression,
            FilterExpression: options?.filterExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames: options?.expressionAttributeNames,
            IndexName: options?.indexName,
            Limit: options?.limit,
            ScanIndexForward: options?.scanIndexForward,
          });
          const response = await client.send(command);
          const items = (response.Items as T[]) || [];

          standardMetrics?.addCount('DynamoDBQuery', items.length);
          return items;
        },
        'Query',
        {
          ...options,
          hasFilter: !!options?.filterExpression,
          indexName: options?.indexName,
          tableName: config.tableName,
          keyConditionExpression,
          expressionAttributeValues,
        }
      );

      if (!result.success) {
        throw result.error;
      }
      return result.data!;
    },
  };
}

/**
 * Factory function for DynamoDB wrapper creation with table pre-configured
 */
export function createDynamoDBWrapperFactory(
  client: DynamoDBDocumentClient,
  baseConfig: AwsWrapperConfig
) {
  return (tableName: string) => createDynamoDBWrapper(client, { ...baseConfig, tableName });
}
