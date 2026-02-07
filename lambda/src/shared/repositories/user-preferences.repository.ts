import { Logger } from '@aws-lambda-powertools/logger';
import { DynamoDBWrapper } from '../aws/dynamodb-wrapper';
import { UserPreferencesRecord, DDB_PREFIXES, Recurrence } from '../../types';

/**
 * Repository for user preferences records in DynamoDB
 * Uses the consolidated DynamoDB wrapper for consistent patterns
 */
export class UserPreferencesRepository {
  constructor(
    private readonly dbWrapper: DynamoDBWrapper,
    private readonly logger: Logger
  ) {}

  /**
   * Get user preferences by email address
   */
  async getByEmail(userEmail: string): Promise<UserPreferencesRecord | null> {
    try {
      const result = await this.dbWrapper.getItem<UserPreferencesRecord>({
        pk: userEmail,
        sk: `${DDB_PREFIXES.PREFERENCES}USER`,
      });
      return result || null;
    } catch (error) {
      this.logger.error('Failed to get user preferences', {
        userEmail,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Create or update user preferences
   * Only updates explicitly provided fields, allowing intentional nullification
   */
  async upsertPreferences(
    userEmail: string,
    preferences: Partial<
      Pick<
        UserPreferencesRecord,
        | 'timezone'
        | 'customPrompt'
        | 'primaryUseCase'
        | 'reminderStartTime'
        | 'reminderEndTime'
        | 'reminderRecurrence'
        | 'reminderDays'
        | 'emailVerified'
        | 'verificationNonce'
        | 'verificationNonceExpiresAt'
      >
    >
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      const existing = await this.getByEmail(userEmail);

      // Start with base record structure
      const record: UserPreferencesRecord = {
        pk: userEmail,
        sk: `${DDB_PREFIXES.PREFERENCES}USER`,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      // Only include existing values for fields not being explicitly updated
      if (existing) {
        if (!('timezone' in preferences)) record.timezone = existing.timezone;
        if (!('customPrompt' in preferences)) record.customPrompt = existing.customPrompt;
        if (!('primaryUseCase' in preferences)) record.primaryUseCase = existing.primaryUseCase;
        if (!('reminderStartTime' in preferences)) record.reminderStartTime = existing.reminderStartTime;
        if (!('reminderEndTime' in preferences)) record.reminderEndTime = existing.reminderEndTime;
        if (!('reminderRecurrence' in preferences)) record.reminderRecurrence = existing.reminderRecurrence;
        if (!('reminderDays' in preferences)) record.reminderDays = existing.reminderDays;
        if (!('emailVerified' in preferences)) record.emailVerified = existing.emailVerified;
        if (!('verificationNonce' in preferences))
          record.verificationNonce = existing.verificationNonce;
        if (!('verificationNonceExpiresAt' in preferences))
          record.verificationNonceExpiresAt = existing.verificationNonceExpiresAt;
      }

      // Explicitly set any provided preferences (including undefined to clear values)
      Object.keys(preferences).forEach((key) => {
        type UserPreferenceKey = keyof typeof preferences;
        const typedKey = key as UserPreferenceKey;
        (record as Record<UserPreferenceKey, unknown>)[typedKey] = preferences[typedKey];
      });

      await this.dbWrapper.putItem(record);
    } catch (error) {
      this.logger.error('Failed to upsert user preferences', {
        userEmail,
        preferences,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete user preferences
   */
  async delete(userEmail: string): Promise<void> {
    try {
      await this.dbWrapper.deleteItem({
        pk: userEmail,
        sk: `${DDB_PREFIXES.PREFERENCES}USER`,
      });
    } catch (error) {
      this.logger.error('Failed to delete user preferences', {
        userEmail,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
