/**
 * Get current date and time in a specific timezone
 * @param timezoneOffset - Timezone offset string like "-07:00" or IANA timezone like "America/Los_Angeles"
 * @returns Object with currentDate (YYYY-MM-DD) and currentTime (HH:MM AM/PM) in the specified timezone
 */
export function getCurrentDateTimeInTimezone(timezoneOffset: string): {
  currentDate: string;
  currentTime: string;
} {
  const now = new Date();

  // Handle IANA timezone names (e.g., "America/Los_Angeles")
  if (!timezoneOffset.match(/^[+-]\d{2}:\d{2}$/)) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezoneOffset,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const currentDate = formatter.format(now); // Returns YYYY-MM-DD

      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezoneOffset,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false, // Use 24-hour format for consistency with AI prompt
      });
      const currentTime = timeFormatter.format(now); // Returns HH:MM

      return { currentDate, currentTime };
    } catch {
      // Fallback to UTC if timezone is invalid
      return {
        currentDate: now.toISOString().split('T')[0],
        currentTime: now.toISOString().split('T')[1].substring(0, 5), // HH:MM
      };
    }
  }

  // Handle timezone offset format (e.g., "-07:00")
  // Parse the offset
  const offsetMatch = timezoneOffset.match(/([+-])(\d{2}):(\d{2})/);
  if (!offsetMatch) {
    // Invalid format, return UTC
    return {
      currentDate: now.toISOString().split('T')[0],
      currentTime: now.toISOString().split('T')[1].substring(0, 5),
    };
  }

  const sign = offsetMatch[1] === '+' ? 1 : -1;
  const hours = parseInt(offsetMatch[2]);
  const minutes = parseInt(offsetMatch[3]);
  const totalOffsetMinutes = sign * (hours * 60 + minutes);

  // Apply the offset to get local time
  const localTime = new Date(now.getTime() + totalOffsetMinutes * 60 * 1000);

  const year = localTime.getUTCFullYear();
  const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localTime.getUTCDate()).padStart(2, '0');
  const hour = String(localTime.getUTCHours()).padStart(2, '0');
  const minute = String(localTime.getUTCMinutes()).padStart(2, '0');

  return {
    currentDate: `${year}-${month}-${day}`,
    currentTime: `${hour}:${minute}`,
  };
}

/**
 * Critical timezone bugfix: Parse AI-provided ISO string to local Date components
 *
 * Problem: new Date("2025-09-16T09:00:00-07:00") converts to UTC ("2025-09-16T16:00:00.000Z")
 * but ical-generator treats the UTC Date as if it's already in the target timezone,
 * causing 9 AM to become 4 PM in the generated ICS file.
 *
 * Solution: Extract local time components (year, month, day, hour, minute) directly
 * from the ISO string and create a Date object using those local components.
 *
 * @param isoDateTime - AI-provided ISO datetime with timezone offset (e.g., "2025-09-16T09:00:00-07:00")
 * @returns Date object created from local time components (not UTC conversion)
 */
export function parseISOToLocalDate(isoDateTime: string): Date {
  const isoMatch = isoDateTime.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/
  );
  if (!isoMatch) {
    throw new Error(`Invalid ISO datetime format: ${isoDateTime}`);
  }

  const [, year, month, day, hour, minute, second] = isoMatch;

  // Create Date objects using LOCAL time components (avoid UTC conversion)
  return new Date(
    parseInt(year),
    parseInt(month) - 1, // JavaScript months are 0-indexed
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
}

/**
 * Extract timezone offset from AI-provided ISO datetime string
 * @param isoDateTime - ISO datetime with timezone offset (e.g., "2025-09-16T09:00:00-07:00")
 * @returns Timezone offset string (e.g., "-07:00") or null if not found
 */
export function extractTimezoneOffset(isoDateTime: string): string | null {
  if (!isoDateTime) {
    return null;
  }
  const match = isoDateTime.match(/([+-]\d{2}:\d{2})$/);
  return match ? match[1] : null;
}

/**
 * Convert email date string to ISO 8601 format while preserving timezone information
 * @param emailDateString - Email date string like "Fri, 29 Aug 2025 09:20:19 -0700"
 * @returns ISO string with timezone preserved
 */
export function convertEmailDateToIso(emailDateString: string): string {
  // Parse the date string to extract timezone offset manually
  // Email dates are in RFC 2822 format: "Fri, 29 Aug 2025 09:20:19 -0700"
  const tzMatch = emailDateString.match(/([+-]\d{4})$/);

  if (!tzMatch) {
    // Fallback to standard parsing if no timezone found
    return new Date(emailDateString).toISOString();
  }

  const tzOffset = tzMatch[1]; // e.g., "-0700"

  // Parse the date components manually to preserve local time
  // RFC 2822 format: "Fri, 29 Aug 2025 09:20:19 -0700"
  const dateMatch = emailDateString.match(
    /^\w+,\s+(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/
  );

  if (!dateMatch) {
    // Fallback if parsing fails
    return new Date(emailDateString).toISOString();
  }

  const [, day, monthName, year, hour, minute, second] = dateMatch;

  // Month name to number mapping
  const monthMap: { [key: string]: string } = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
  };

  const monthNum = monthMap[monthName];
  if (!monthNum) {
    // Fallback if month parsing fails
    return new Date(emailDateString).toISOString();
  }

  // Convert offset from -0700 format to -07:00 format
  const offsetHours = tzOffset.substring(1, 3);
  const offsetMinutes = tzOffset.substring(3, 5);
  const offsetSign = tzOffset.substring(0, 1);
  const formattedOffset = `${offsetSign}${offsetHours}:${offsetMinutes}`;

  // Build ISO string with local time and timezone offset
  const paddedDay = day.padStart(2, '0');
  const paddedHour = hour.padStart(2, '0');
  const paddedMinute = minute.padStart(2, '0');
  const paddedSecond = second.padStart(2, '0');

  return `${year}-${monthNum}-${paddedDay}T${paddedHour}:${paddedMinute}:${paddedSecond}.000${formattedOffset}`;
}

/**
 * Gets the current timestamp in ISO format
 * @returns Current UTC timestamp as ISO string
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Gets the current date in RFC 2822 format for email headers
 * @returns Current date formatted for email Date header
 */
export function getRfc2822Date(): string {
  return new Date().toUTCString();
}

/**
 * Checks if a given date string represents a time in the past
 * @param dateString - ISO date string or any valid date string
 * @returns true if the date is in the past, false otherwise
 */
export function isPastDate(dateString: string): boolean {
  const targetDate = new Date(dateString);
  const now = new Date();
  return targetDate < now;
}

/**
 * Converts a Date object to ISO string while preserving the local timezone
 * This is the opposite of toISOString() which converts to UTC
 * @param date - Date object to format
 * @param timezone - Timezone string like "-07:00" to append to the result
 * @returns ISO string with local time and timezone, e.g. "2025-09-15T09:00:00-07:00"
 */
export function toLocalISOString(date: Date, timezone?: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  const localISO = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

  // If timezone is provided, append it, otherwise return without timezone
  return timezone ? `${localISO}${timezone}` : localISO;
}

/**
 * Formats a date object or TZDate object into the ICS date-time format (YYYYMMDDTHHMMSS)
 * This consolidates the repeated pattern of formatting dates for ICS files
 * @param date - Date or TZDate object to format
 * @returns Date string in YYYYMMDDTHHMMSS format required for ICS files
 */
export function formatDateToICSFormat(date: Date): string {
  // Support both standard Date objects and TZDate objects
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hour}${minute}${second}`;
}

/**
 * Converts an ISO 8601 date string to a human-friendly format
 * @param isoDateString - ISO 8601 date string like "2020-06-30T22:41:26+02:00" or "2025-09-08T09:00:00.000-07:00"
 * @returns Human-friendly date string like "Saturday, August 30 2025 @ 2PM (PDT)"
 */
export function formatToHumanFriendly(isoDateString: string): string {
  try {
    // Parse the input string to extract components
    const match = isoDateString.match(
      /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d{3})?([+-]\d{2}:\d{2})$/
    );

    if (!match) {
      throw new Error(`Invalid date format: ${isoDateString}`);
    }

    const [, datePart, timePart, tzOffset] = match;

    // Extract the LOCAL time components from the ISO string
    // "2025-09-06T00:00:00.000-07:00" means 00:00 LOCAL time in -07:00 timezone
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    // Parse timezone offset
    const offsetMatch = tzOffset.match(/([+-])(\d{2}):(\d{2})/);
    if (!offsetMatch) {
      throw new Error(`Invalid timezone offset: ${tzOffset}`);
    }

    // Create a proper Date object by parsing the full ISO string
    // This gives us the correct UTC representation that we can format properly
    const date = new Date(isoDateString);

    // Get timezone abbreviation based on offset and whether we're in DST
    const getTimezoneAbbreviation = (offset: string, testDate: Date): string => {
      // Helper to determine if date is in DST for US timezones
      const isDst = (checkDate: Date): boolean => {
        const year = checkDate.getFullYear();
        // DST in US: second Sunday in March to first Sunday in November
        const dstStart = new Date(year, 2, 14 - new Date(year, 2, 1).getDay());
        const dstEnd = new Date(year, 10, 7 - new Date(year, 10, 1).getDay());
        return checkDate >= dstStart && checkDate < dstEnd;
      };

      switch (offset) {
        case '-08:00':
          return 'PST';
        case '-07:00':
          return isDst(testDate) ? 'PDT' : 'MST';
        case '-06:00':
          return isDst(testDate) ? 'MDT' : 'CST';
        case '-05:00':
          return isDst(testDate) ? 'CDT' : 'EST';
        case '-04:00':
          return 'EDT';
        case '+00:00':
          return 'UTC';
        default:
          return offset; // Fallback to raw offset for unknown timezones
      }
    };

    const timeZoneName = getTimezoneAbbreviation(tzOffset, date);

    // Format the date components directly from the local time values we extracted
    // We don't use Intl.DateTimeFormat because it would apply timezone conversion again
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const weekdayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    // Create a temporary date to get the weekday (using local components)
    const tempDate = new Date(year, month - 1, day);
    const weekday = weekdayNames[tempDate.getDay()];
    const monthName = monthNames[month - 1];

    // Format time with proper AM/PM
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const dayPeriod = hour < 12 ? 'AM' : 'PM';
    const timeStr =
      minute === 0
        ? `${hour12}${dayPeriod}`
        : `${hour12}:${minute.toString().padStart(2, '0')}${dayPeriod}`;

    return `${weekday}, ${monthName} ${day} ${year} @ ${timeStr} (${timeZoneName})`;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error formatting date:', error, 'Input:', isoDateString);

    // Fallback to basic date parsing
    try {
      const date = new Date(isoDateString);
      return date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });
    } catch {
      return `Invalid date: ${isoDateString}`;
    }
  }
}
