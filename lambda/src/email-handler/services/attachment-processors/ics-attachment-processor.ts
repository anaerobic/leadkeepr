/**
 * ICS (Calendar) attachment processor
 * Processes calendar file attachments and extracts RSVP information
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { BaseAttachmentProcessor } from './base-attachment-processor';

import ICAL from 'ical.js';
import { EmailAttachment } from '../../../types';

export interface RSVPInfo {
  isRSVP: boolean;
  rsvpStatus?: 'accepted' | 'declined' | 'tentative';
  attendeeEmail?: string;
  eventSummary?: string;
  eventDateTime?: string;
  organizerEmail?: string;
  method?: string;
}

export class ICSAttachmentProcessor extends BaseAttachmentProcessor {
  constructor(logger: Logger) {
    super(logger);
  }

  canProcess(attachment: EmailAttachment): boolean {
    return (
      attachment.contentType === 'text/calendar' ||
      attachment.contentType === 'application/ics' ||
      attachment.filename?.toLowerCase().endsWith('.ics') ||
      false
    );
  }

  async processAttachment(
    attachment: EmailAttachment,
    bucketName: string,
    objectKey: string
  ): Promise<string | null> {
    try {
      const { parsed } = await this.downloadAndParseEmail(bucketName, objectKey);

      // Find the specific ICS attachment
      const icsAttachment = this.findAttachment(parsed, attachment);

      if (!icsAttachment || !icsAttachment.content) {
        this.logger.warn('ICS attachment not found or has no content', {
          filename: attachment.filename,
          contentType: attachment.contentType,
          found: !!icsAttachment,
          hasContent: !!icsAttachment?.content,
        });
        return null;
      }

      const icsContent = icsAttachment.content.toString('utf8');
      const rsvpInfo = this.parseICSForRSVP(icsContent);

      // Return a structured description of the RSVP info
      if (rsvpInfo.isRSVP) {
        let description = `CALENDAR RSVP: ${rsvpInfo.rsvpStatus?.toUpperCase() || 'UNKNOWN'}`;

        if (rsvpInfo.eventSummary) {
          description += ` for "${rsvpInfo.eventSummary}"`;
        }

        if (rsvpInfo.attendeeEmail) {
          description += ` from ${rsvpInfo.attendeeEmail}`;
        }

        if (rsvpInfo.eventDateTime) {
          description += ` (Event: ${rsvpInfo.eventDateTime})`;
        }

        description += ` [METHOD: ${rsvpInfo.method || 'UNKNOWN'}]`;

        return description;
      }

      // Return generic calendar info if not an RSVP
      return this.extractBasicCalendarInfo(icsContent);
    } catch (error) {
      this.logger.warn('Failed to parse ICS attachment', {
        filename: attachment.filename,
        objectKey,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return minimal info if parsing fails
      return `Calendar attachment: ${attachment.filename || 'invite.ics'}`;
    }
  }

  /**
   * Parse ICS content specifically looking for RSVP information
   */
  private parseICSForRSVP(icsContent: string): RSVPInfo {
    try {
      const jcalData = ICAL.parse(icsContent);
      const comp = new ICAL.Component(jcalData);

      const methodValue = comp.getFirstPropertyValue('method');
      const method = typeof methodValue === 'string' ? methodValue.toLowerCase() : undefined;
      const isMethodReply = method === 'reply';

      // Look for VEVENT components
      const vevents = comp.getAllSubcomponents('vevent');

      if (vevents.length === 0) {
        return { isRSVP: false };
      }

      const vevent = vevents[0]; // Use first event
      const eventSummary = vevent.getFirstPropertyValue('summary');
      const dtstart = vevent.getFirstPropertyValue('dtstart');
      const organizer = vevent.getFirstPropertyValue('organizer');

      // Look for attendees and their participation status
      const attendees = vevent.getAllProperties('attendee');
      let rsvpStatus: 'accepted' | 'declined' | 'tentative' | undefined;
      let attendeeEmail: string | undefined;

      // Find attendee with PARTSTAT indicating their response
      for (const attendee of attendees) {
        const partstatValue = attendee.getParameter('partstat');
        const partstat =
          typeof partstatValue === 'string' ? partstatValue.toLowerCase() : undefined;
        const attendeeValue = attendee.getFirstValue();
        const email = this.extractEmailFromUri(
          typeof attendeeValue === 'string' ? attendeeValue : undefined
        );

        if (partstat && ['accepted', 'declined', 'tentative'].includes(partstat)) {
          rsvpStatus = partstat as 'accepted' | 'declined' | 'tentative';
          attendeeEmail = email;
          break;
        }
      }

      return {
        isRSVP: isMethodReply && !!rsvpStatus,
        rsvpStatus,
        attendeeEmail,
        eventSummary: typeof eventSummary === 'string' ? eventSummary : undefined,
        eventDateTime: dtstart?.toString(),
        organizerEmail: this.extractEmailFromUri(
          typeof organizer === 'string' ? organizer : undefined
        ),
        method,
      };
    } catch (error) {
      this.logger.warn('Error parsing ICS for RSVP info', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { isRSVP: false };
    }
  }

  /**
   * Extract basic calendar information when not an RSVP
   */
  private extractBasicCalendarInfo(icsContent: string): string {
    try {
      const jcalData = ICAL.parse(icsContent);
      const comp = new ICAL.Component(jcalData);

      const methodValue = comp.getFirstPropertyValue('method');
      const method = typeof methodValue === 'string' ? methodValue : 'unknown';
      const vevents = comp.getAllSubcomponents('vevent');

      if (vevents.length === 0) {
        return `Calendar file with method: ${method}`;
      }

      const vevent = vevents[0];
      const summaryValue = vevent.getFirstPropertyValue('summary');
      const summary = typeof summaryValue === 'string' ? summaryValue : undefined;
      const dtstart = vevent.getFirstPropertyValue('dtstart');

      let info = 'Calendar event';
      if (summary) info += `: "${summary}"`;
      if (dtstart) info += ` on ${dtstart.toString()}`;
      info += ` [${method}]`;

      return info;
    } catch {
      return 'Calendar attachment (parse error)';
    }
  }

  /**
   * Extract email address from calendar URI format
   */
  private extractEmailFromUri(uri: string | undefined): string | undefined {
    if (!uri) return undefined;

    // Handle "mailto:email@domain.com" format
    if (uri.toLowerCase().startsWith('mailto:')) {
      return uri.substring(7);
    }

    // Handle direct email format
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const match = uri.match(emailRegex);
    return match ? match[1] : undefined;
  }
}
