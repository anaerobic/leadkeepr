import { Logger } from '@aws-lambda-powertools/logger';
import { UserPreferencesRepository } from '../repositories/user-preferences.repository';
import { UserPreferencesRecord, Recurrence, PromptSettings } from '../../types';

/**
 * Service for managing user preferences
 * Provides business logic around user preference operations
 */
export class UserPreferencesService {
  constructor(
    private readonly userPreferencesRepository: UserPreferencesRepository,
    private readonly logger: Logger
  ) {}

  /**
   * Get all user preferences
   * @param userEmail The user's email address
   * @returns User preferences record or null if not found
   */
  async getUserPreferences(userEmail: string): Promise<UserPreferencesRecord | null> {
    try {
      const result = await this.userPreferencesRepository.getByEmail(userEmail);

      return result;
    } catch (error) {
      this.logger.error('Error getting user preferences', {
        userEmail,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Set or update a user's custom prompt and related customization preferences
   * @param userEmail The user's email address
   * @param customizationData Customization data from preferences analyzer
   */
  async setCustomizationPreferences(
    userEmail: string,
    customizationData: PromptSettings & {
      primaryUseCase?: string;
    }
  ): Promise<void> {
    // Validate customPrompt if provided
    if (customizationData.customPrompt !== undefined) {
      if (customizationData.customPrompt.trim().length === 0) {
        const error = 'Custom prompt cannot be empty if provided';
        this.logger.error('Custom prompt validation failed', {
          userEmail,
          error,
        });
        throw new Error(error);
      }

      // Basic sanity check - reject extremely long prompts (potential attack)
      if (customizationData.customPrompt.length > 2000) {
        const error = 'Custom prompt is too long (maximum 2000 characters)';
        this.logger.error('Custom prompt validation failed', {
          userEmail,
          customPromptLength: customizationData.customPrompt.length,
          error,
        });
        throw new Error(error);
      }
    }

    await this.userPreferencesRepository.upsertPreferences(userEmail, {
      customPrompt: customizationData.customPrompt,
      primaryUseCase: customizationData.primaryUseCase,
      timezone: customizationData.timezone,
      reminderStartTime: customizationData.reminderStartTime,
      reminderEndTime: customizationData.reminderEndTime,
      reminderRecurrence: customizationData.reminderRecurrence,
      reminderDays: customizationData.reminderDays,
    });
  }

}
