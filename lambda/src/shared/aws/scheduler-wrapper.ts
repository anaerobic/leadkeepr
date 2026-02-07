/**
 * Standardized EventBridge Scheduler operations wrapper with consistent error handling and metrics
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */

import {
  SchedulerClient,
  CreateScheduleCommand,
  UpdateScheduleCommand,
  GetScheduleCommand,
  GetScheduleOutput,
  DeleteScheduleCommand,
  FlexibleTimeWindowMode,
  ActionAfterCompletion,
  ResourceNotFoundException,
} from '@aws-sdk/client-scheduler';
import {
  AwsWrapperConfig,
  createAwsOperationExecutor,
  createAwsMetricsHelper,
} from './wrapper-base';

/**
 * Schedule configuration for creating or updating schedules
 */
export interface ScheduleConfig {
  name: string;
  groupName: string;
  scheduleExpression: string;
  timezone?: string;
  target: ScheduleTarget;
  description?: string;
  flexibleTimeWindow?: {
    Mode: FlexibleTimeWindowMode;
    MaximumWindowInMinutes?: number;
  };
  actionAfterCompletion?: ActionAfterCompletion;
  retryPolicy?: {
    MaximumEventAgeInSeconds?: number;
    MaximumRetryAttempts?: number;
  };
  deadLetterConfig?: {
    Arn?: string;
  };
}

export interface ScheduleRequest<T> {
  name: string;
  scheduleExpression: string;
  timezone: string;
  payload: T;
  description: string;
}

/**
 * Result of schedule operations
 */
export interface ScheduleResult {
  success: boolean;
  scheduleArn?: string;
  error?: string;
  action?: 'created' | 'updated' | 'deleted';
}

/**
 * Schedule target configuration
 */
export interface ScheduleTarget {
  arn: string;
  roleArn: string;
  input?: string;
}

export interface ScheduleTargetInput<T> {
  source: 'scheduler.reminder';
  'detail-type': 'Reminder Triggered';
  detail: T;
}

/**
 * Type definition for Scheduler wrapper interface
 */
export type SchedulerWrapper = ReturnType<typeof createSchedulerWrapper>;

/**
 * Standardized EventBridge Scheduler operations wrapper
 */
export function createSchedulerWrapper(client: SchedulerClient, config: AwsWrapperConfig) {
  const executeSchedulerOperation = createAwsOperationExecutor('Scheduler', config);
  const standardMetrics = createAwsMetricsHelper(config);

  return {
    async createSchedule(scheduleConfig: ScheduleConfig): Promise<ScheduleResult> {
      const result = await executeSchedulerOperation(
        async () => {
          const command = new CreateScheduleCommand({
            Name: scheduleConfig.name,
            GroupName: scheduleConfig.groupName,
            ScheduleExpression: scheduleConfig.scheduleExpression,
            ScheduleExpressionTimezone: scheduleConfig.timezone || 'UTC',
            FlexibleTimeWindow: scheduleConfig.flexibleTimeWindow || {
              Mode: FlexibleTimeWindowMode.OFF,
            },
            Target: {
              Arn: scheduleConfig.target.arn,
              RoleArn: scheduleConfig.target.roleArn,
              Input: scheduleConfig.target.input,
              RetryPolicy: scheduleConfig.retryPolicy,
              DeadLetterConfig: scheduleConfig.deadLetterConfig,
            },
            ActionAfterCompletion:
              scheduleConfig.actionAfterCompletion || ActionAfterCompletion.DELETE,
            Description: scheduleConfig.description,
          });

          const response = await client.send(command);
          standardMetrics?.addCount('SchedulerCreateSchedule', 1);

          return {
            success: true,
            scheduleArn: response.ScheduleArn,
            action: 'created' as const,
          };
        },
        'CreateSchedule',
        {
          scheduleName: scheduleConfig.name,
          groupName: scheduleConfig.groupName,
          timezone: scheduleConfig.timezone,
        }
      );

      return result.success
        ? result.data!
        : {
            success: false,
            error: result.error?.message || 'Unknown error',
          };
    },

    async updateSchedule(scheduleConfig: ScheduleConfig): Promise<ScheduleResult> {
      const result = await executeSchedulerOperation(
        async () => {
          const command = new UpdateScheduleCommand({
            Name: scheduleConfig.name,
            GroupName: scheduleConfig.groupName,
            ScheduleExpression: scheduleConfig.scheduleExpression,
            ScheduleExpressionTimezone: scheduleConfig.timezone || 'UTC',
            FlexibleTimeWindow: scheduleConfig.flexibleTimeWindow || {
              Mode: FlexibleTimeWindowMode.OFF,
            },
            Target: {
              Arn: scheduleConfig.target.arn,
              RoleArn: scheduleConfig.target.roleArn,
              Input: scheduleConfig.target.input,
              RetryPolicy: scheduleConfig.retryPolicy,
              DeadLetterConfig: scheduleConfig.deadLetterConfig,
            },
            ActionAfterCompletion:
              scheduleConfig.actionAfterCompletion || ActionAfterCompletion.DELETE,
            Description: scheduleConfig.description,
          });

          const response = await client.send(command);
          standardMetrics?.addCount('SchedulerUpdateSchedule', 1);

          return {
            success: true,
            scheduleArn: response.ScheduleArn,
            action: 'updated' as const,
          };
        },
        'UpdateSchedule',
        {
          scheduleName: scheduleConfig.name,
          groupName: scheduleConfig.groupName,
          timezone: scheduleConfig.timezone,
        }
      );

      return result.success
        ? result.data!
        : {
            success: false,
            error: result.error?.message || 'Unknown error',
          };
    },

    async getSchedule(
      name: string,
      groupName: string
    ): Promise<{ exists: boolean; schedule?: GetScheduleOutput }> {
      const result = await executeSchedulerOperation(
        async () => {
          const command = new GetScheduleCommand({
            Name: name,
            GroupName: groupName,
          });

          const response = await client.send(command);
          standardMetrics?.addCount('SchedulerGetSchedule', 1);

          return {
            exists: true,
            schedule: response,
          };
        },
        'GetSchedule',
        {
          scheduleName: name,
          groupName,
        }
      );

      if (result.success) {
        return result.data!;
      }

      // Handle ResourceNotFound as a non-error case
      if (result.error instanceof ResourceNotFoundException) {
        return { exists: false };
      }

      throw result.error;
    },

    async deleteSchedule(name: string, groupName: string): Promise<ScheduleResult> {
      const result = await executeSchedulerOperation(
        async () => {
          const command = new DeleteScheduleCommand({
            Name: name,
            GroupName: groupName,
          });

          await client.send(command);
          standardMetrics?.addCount('SchedulerDeleteSchedule', 1);

          return {
            success: true,
            action: 'deleted' as const,
          };
        },
        'DeleteSchedule',
        {
          scheduleName: name,
          groupName,
        }
      );

      return result.success
        ? result.data!
        : {
            success: false,
            error: result.error?.message || 'Unknown error',
          };
    },

    async createOrUpdateSchedule(scheduleConfig: ScheduleConfig): Promise<ScheduleResult> {
      // Check if schedule exists first
      const existingSchedule = await this.getSchedule(
        scheduleConfig.name,
        scheduleConfig.groupName
      );

      if (existingSchedule.exists) {
        return await this.updateSchedule(scheduleConfig);
      } else {
        return await this.createSchedule(scheduleConfig);
      }
    },

    /**
     * Abstracts AWS-specific concerns from business logic
     */
    async createReminderSchedule<T>(
      request: ScheduleRequest<T>,
      groupName: string,
      targetQueueArn: string,
      executionRoleArn: string,
      options?: {
        retryPolicy?: {
          MaximumEventAgeInSeconds?: number;
          MaximumRetryAttempts?: number;
        };
        deadLetterQueueArn?: string;
      }
    ): Promise<ScheduleResult> {
      const targetInput: ScheduleTargetInput<T> = {
        source: 'scheduler.reminder',
        'detail-type': 'Reminder Triggered',
        detail: request.payload,
      };
      // Build the schedule configuration with AWS concerns abstracted
      const scheduleConfig: ScheduleConfig = {
        name: request.name,
        groupName,
        scheduleExpression: request.scheduleExpression,
        timezone: request.timezone,
        target: {
          arn: targetQueueArn,
          roleArn: executionRoleArn,
          input: JSON.stringify(targetInput),
        },
        description: request.description,
        actionAfterCompletion: ActionAfterCompletion.DELETE,
        retryPolicy: options?.retryPolicy,
        deadLetterConfig: options?.deadLetterQueueArn
          ? { Arn: options.deadLetterQueueArn }
          : undefined,
      };

      return await this.createOrUpdateSchedule(scheduleConfig);
    },
  };
}
