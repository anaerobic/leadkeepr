/**
 * Event Duration Utilities - Simplified duration parsing for edge cases
 *
 * Most duration logic is now handled by AI which provides intelligent endDateTime.
 * These utilities are kept for any edge cases where manual duration parsing is needed.
 */

/**
 * Parse ISO 8601 duration string to minutes
 * @param duration - Duration in ISO 8601 format (e.g., "PT1H30M", "PT15M")
 * @returns Duration in minutes
 */
export function parseDurationToMinutes(duration: string): number {
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match) {
    // Invalid duration format, default to 15 minutes
    return 15;
  }

  const [, hours = '0', minutes = '0'] = match;
  return parseInt(hours) * 60 + parseInt(minutes);
}

/**
 * Convert minutes to ISO 8601 duration format
 * @param minutes - Duration in minutes
 * @returns Duration in ISO 8601 format (e.g., "PT15M", "PT1H30M")
 */
export function minutesToDuration(minutes: number): string {
  if (minutes < 60) {
    return `PT${minutes}M`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `PT${hours}H`;
  }

  return `PT${hours}H${remainingMinutes}M`;
}
