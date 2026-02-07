import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@aws-lambda-powertools/logger';
import { convertTimezoneOffsetToIANA } from '../../shared/utils/formatting-utils';
import { parseISOToLocalDate, extractTimezoneOffset } from '../../shared/utils/dates';
import icalGenerator, {
  ICalCalendarMethod,
  ICalAttendeeStatus,
  ICalAttendeeRole,
  ICalAttendeeType,
  ICalEventStatus,
} from 'ical-generator';
import { EmailAttachmentICS } from '../../types';

interface ICSOptions {
  summary: string;
  startDateTime: string;
  endDateTime?: string; // AI can provide endDateTime for smart duration
  timezone?: string;
  recurrenceRule?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
  description?: string;
  location?: string;
  uid?: string; // Optional predefined UID for updates/cancellations
  sequence?: number; // Sequence number for updates (0 for new, >0 for updates)
}

export class ICSAttachmentService {
  constructor(private readonly logger: Logger) {}

  /**
   * Parse start and end dates with timezone validation
   */
  private parseDateRange(
    startDateTime: string,
    endDateTime?: string,
    uid?: string
  ): { startDate: Date; endDate: Date } {
    if (!startDateTime) {
      throw new Error(
        `Cannot parse date range: startDateTime is null or empty${uid ? ` for UID ${uid}` : ''}`
      );
    }

    const timezoneOffset = extractTimezoneOffset(startDateTime);

    if (!timezoneOffset && uid) {
      this.logger.warn('AI provided datetime without timezone offset', {
        uid,
        inputDateTime: startDateTime,
        expectedFormat: 'YYYY-MM-DDTHH:mm:ss±HH:MM',
      });
    }

    const startDate = parseISOToLocalDate(startDateTime);
    const endDate = endDateTime
      ? parseISOToLocalDate(endDateTime)
      : new Date(startDate.getTime() + 15 * 60 * 1000); // 15 minute default

    return { startDate, endDate };
  }

  /**
   * Setup organizer and attendee for an event
   */
  private setupEventParticipants(
    event: any,
    organizerEmail?: string,
    attendeeEmail?: string,
    isUpdate: boolean = false
  ) {
    if (organizerEmail) {
      event.organizer({
        name: 'leadkeepr',
        email: organizerEmail,
      });
    }

    if (attendeeEmail) {
      event.createAttendee({
        name: 'Recipient',
        email: attendeeEmail,
        rsvp: false,
        status: isUpdate ? ICalAttendeeStatus.NEEDSACTION : ICalAttendeeStatus.ACCEPTED,
        role: ICalAttendeeRole.REQ,
        type: ICalAttendeeType.INDIVIDUAL,
      });
    }
  }

  createRecurringEventICS(options: ICSOptions): EmailAttachmentICS {
    return this.createEventICS(options);
  }

  createOneTimeEventICS(options: ICSOptions): EmailAttachmentICS {
    return this.createEventICS(options);
  }

  /**
   * Create a CANCEL method ICS file to cancel a previously sent event
   */
  createCancellationICS(options: {
    uid: string;
    summary: string;
    startDateTime: string;
    endDateTime?: string;
    organizerEmail: string;
    attendeeEmail: string;
    timezone?: string;
    cancellationReason?: string;
  }): EmailAttachmentICS {
    if (!options.timezone) {
      const errorMessage = 'Cannot create cancellation ICS without timezone information';
      this.logger.error(errorMessage, {
        uid: options.uid,
        summary: options.summary,
        startDateTime: options.startDateTime,
      });
      throw new Error(errorMessage);
    }

    const timezone = convertTimezoneOffsetToIANA(options.timezone);
    const { startDate, endDate } = this.parseDateRange(
      options.startDateTime,
      options.endDateTime,
      options.uid
    );

    const calendar = icalGenerator({
      prodId: { company: 'todo', product: 'calendar', language: 'EN' },
      method: ICalCalendarMethod.CANCEL,
    });

    const event = calendar.createEvent({
      id: options.uid,
      sequence: 1,
      start: startDate,
      end: endDate,
      timezone: timezone,
      summary: options.summary,
      description: options.cancellationReason || `This event has been cancelled.`,
      status: ICalEventStatus.CANCELLED,
    });

    this.setupEventParticipants(event, options.organizerEmail, options.attendeeEmail, true);

    const icsContent = calendar.toString();

    return {
      filename: `${options.uid}.ics`,
      content: icsContent,
      contentType: 'text/calendar; charset=UTF-8; method=CANCEL',
      uid: options.uid,
    };
  }

  private createEventICS(
    options: ICSOptions & {
      uid?: string;
    }
  ): EmailAttachmentICS {
    const uid = options.uid || uuidv4();

    if (!options.timezone) {
      const errorMessage = 'Cannot create ICS without timezone information';
      this.logger.error(errorMessage, {
        uid,
        summary: options.summary,
        startDateTime: options.startDateTime,
      });
      throw new Error(errorMessage);
    }

    const timezone = convertTimezoneOffsetToIANA(options.timezone);

    const { startDate, endDate } = this.parseDateRange(
      options.startDateTime,
      options.endDateTime,
      uid
    );

    const calendar = icalGenerator({
      prodId: {
        company: 'todo',
        product: 'calendar',
        language: 'EN',
      },
      method:
        options.organizerEmail && options.attendeeEmail ? ICalCalendarMethod.REQUEST : undefined,
    });

    // Add calendar-level properties to discourage automatic responses
    if (options.organizerEmail && options.attendeeEmail) {
      calendar.x([
        { key: 'X-WR-CALNAME', value: 'Assistant Calendar' },
        { key: 'X-MICROSOFT-CALSCALE', value: 'GREGORIAN' },
        // Discourage automatic processing/replies at the calendar level
        { key: 'X-AUTO-ACCEPT', value: 'FALSE' },
        { key: 'X-SUPPRESS-AUTO-RESPONSE', value: 'TRUE' },
      ]);
    }

    const event = calendar.createEvent({
      id: uid,
      sequence: options.sequence || 0, // Use provided sequence or default to 0
      start: startDate, // Use Date directly from AI-provided ISO string
      end: endDate, // Simple duration addition
      timezone: timezone,
      summary: options.summary,
      description: options.description || `Calendar event: ${options.summary}`,
      location: options.location,
    });

    this.setupEventParticipants(event, options.organizerEmail, options.attendeeEmail, false);

    if (options.recurrenceRule) {
      event.repeating(options.recurrenceRule);
    }

    // Add custom properties to discourage automatic RSVP emails to organizer
    // According to RFC 5545, we can add X-properties to control client behavior
    if (options.organizerEmail && options.attendeeEmail) {
      event.x([
        { key: 'X-MICROSOFT-CDO-BUSYSTATUS', value: 'BUSY' },
        { key: 'X-MICROSOFT-CDO-INTENDEDSTATUS', value: 'BUSY' },
        { key: 'X-MICROSOFT-CDO-ALLDAYEVENT', value: 'FALSE' },
        { key: 'X-MICROSOFT-CDO-IMPORTANCE', value: '1' },
        { key: 'X-MICROSOFT-DISALLOW-COUNTER', value: 'FALSE' },
        // Discourage automatic email notifications to organizer
        { key: 'X-AUTO-RESPONSE', value: 'SUPPRESS' },
        { key: 'X-MICROSOFT-CDO-REPLYTIME', value: '' },
      ]);
    }

    const icsContent = calendar.toString();

    return {
      filename: `${uid}.ics`,
      content: icsContent,
      contentType: 'text/calendar; charset=UTF-8',
      uid: uid, // Return the UID for tracking
    };
  }
}
