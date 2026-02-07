/**
 * Email Intent Analyzer Service
 *
 * A unified service that analyzes email content and extracts all relevant information in one pass:
 * - Email purpose/intent
 * - Direct questions
 * - Reminder requests
 * - Action items
 * - Key insights
 * - Summary
 *
 * This approach simplifies the architecture by making a single comprehensive AI call
 * instead of multiple specialized calls, resulting in more coherent analysis and fewer API requests.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { OpenAIService } from '../../shared/services/openai.service';
import { formatErrorMessage } from '../../shared/utils/formatting-utils';
import { getCurrentDateTimeInTimezone } from '../../shared/utils/dates';
import { EmailIntentAnalysis, PromptSettings } from '../../types';
import { randomUUID } from 'crypto';

export class EmailIntentAnalyzerService {
  constructor(
    private readonly openAIService: OpenAIService,
    private readonly logger: Logger,
    private readonly metrics?: Metrics
  ) { }

  /**
   * Analyze the complete email content to determine intent and extract all relevant information
   */
  async analyzeEmailIntent(
    subject: string,
    emailDate: string,
    isReply: boolean,
    completeContent: string,
    senderEmail: string,
    hasICSAttachment: boolean = false,
    threadContext?: string,
    userPreferences?: PromptSettings
  ): Promise<EmailIntentAnalysis> {
    const startTime = Date.now();

    this.logger.info('Starting email intent analysis', {
      subject: subject.substring(0, 100),
      emailDate,
      isReply,
      contentLength: completeContent.length,
      userTimezone: userPreferences?.timezone,
      hasICSAttachment,
      hasThreadContext: !!threadContext,
      threadContextLength: threadContext?.length || 0,
      hasCustomPrompt: !!userPreferences?.customPrompt,
      customPromptLength: userPreferences?.customPrompt?.length || 0,
    });

    try {

      // Build structured messages for OpenAI
      const promptBuildStartTime = Date.now();
      const messages = this.buildStructuredMessages(
        subject,
        completeContent,
        emailDate,
        senderEmail,
        hasICSAttachment,
        threadContext,
        userPreferences
      );
      const promptBuildDuration = Date.now() - promptBuildStartTime;

      this.logger.info('Structured messages built, making OpenAI API call', {
        subject: subject.substring(0, 100),
        messageCount: messages.length,
        totalMessageLength: messages.reduce((sum, msg) => sum + msg.content.length, 0),
        promptBuildDurationMs: promptBuildDuration,
        hasUserContext: !!userPreferences?.customPrompt,
        hasThreadContext: !!threadContext,
      });

      this.logger.debug('OpenAI request details', {
        subject: subject.substring(0, 100),
        model: 'gpt-4o',
        maxTokens: 5000,
        temperature: 0.1,
        messageBreakdown: messages.map((msg, i) => ({
          index: i,
          role: msg.role,
          contentLength: msg.content.length,
          preview: msg.content.substring(0, 200) + '...'
        }))
      });

      // Use OpenAI to analyze the cleaned email content with structured messages
      const openaiStartTime = Date.now();

      const result = await this.openAIService.chatCompletion({
        messages,
        model: 'gpt-4o',
        maxTokens: 5000,
        temperature: 0.1,
        responseFormat: 'json',
      });
      const openaiDuration = Date.now() - openaiStartTime;

      this.logger.info('OpenAI API call completed, parsing response', {
        subject: subject.substring(0, 100),
        openaiDurationMs: openaiDuration,
        responseLength: result.content.length,
      });

      this.logger.debug('OpenAI response details', {
        subject: subject.substring(0, 100),
        responsePreview: result.content.substring(0, 500) + '...',
        fullResponseLength: result.content.length,
      });

      // Parse the result
      const parseStartTime = Date.now();
      const parsed = JSON.parse(result.content);
      const parseDuration = Date.now() - parseStartTime;

      // Generate UUIDs for new items with null/empty UIDs
      this.generateUUIDsForNewItems(parsed);

      // Add header-based analysis to enhance the AI analysis
      const analysis: EmailIntentAnalysis = {
        isPrimarilyQuestion: parsed.isPrimarilyQuestion || false,
        isReplyToOurEmail: isReply || parsed.isReplyToOurEmail || false,
        confidenceScore: parsed.confidenceScore || 0.5,
        isRSVP: parsed.isRSVP || false,
        isAutomaticRSVP: parsed.isAutomaticRSVP || false,
        rsvpStatus: parsed.rsvpStatus || undefined,
        hasNonRSVPContent: parsed.hasNonRSVPContent !== false, // default to true unless explicitly false
        directQuestion: parsed.directQuestion || undefined,
        reminders: parsed.reminders || [],
        keyInsights: parsed.keyInsights || [],
        summary: parsed.summary || 'Email content summary not available.',
        threadContext: parsed.threadContext,
        replyBody:
          parsed.replyBody ||
          'We experienced a problem while processing your email. Please try again later and contact support if the issue persists.',
      };

      const processingTime = Date.now() - startTime;

      // Log the analysis results with detailed timing breakdown
      this.logger.info('Email intent analysis completed successfully', {
        subject: subject.substring(0, 100),
        isPrimarilyQuestion: analysis.isPrimarilyQuestion,
        isReplyToOurEmail: analysis.isReplyToOurEmail,
        confidenceScore: analysis.confidenceScore,
        hasDirectQuestion: !!analysis.directQuestion,
        hasReminderRequests: analysis.reminders.length > 0,
        keyInsightCount: analysis.keyInsights.length,
        hasCustomPrompt: !!userPreferences?.customPrompt,
        customPromptLength: userPreferences?.customPrompt?.length || 0,
        totalProcessingTimeMs: processingTime,
        breakdownMs: {
          promptBuilding: promptBuildDuration,
          openaiApiCall: openaiDuration,
          responseParsing: parseDuration,
        },
        replyBodyLength: analysis.replyBody.length,
      });

      // Add metrics
      if (this.metrics) {
        this.metrics.addMetric(
          'EmailIntentAnalyzerProcessingTime',
          MetricUnit.Milliseconds,
          processingTime
        );
        this.metrics.addMetric('EmailIntentAnalyzerProcessed', MetricUnit.Count, 1);
      }

      return analysis;
    } catch (err) {
      this.logger.error('Error analyzing email intent', {
        error: formatErrorMessage(err),
      });

      if (this.metrics) {
        this.metrics.addMetric('EmailIntentAnalyzerError', MetricUnit.Count, 1);
      }

      // Return a default analysis with minimal information
      return {
        isPrimarilyQuestion: false,
        isReplyToOurEmail: isReply,
        confidenceScore: 0.5,
        isRSVP: false,
        isAutomaticRSVP: false,
        hasNonRSVPContent: true,
        reminders: [],
        keyInsights: [],
        summary: 'Unable to analyze email content.',
        replyBody:
          'We are unable to process your email at this time. Please try again later and contact support if the issue persists.',
      };
    }
  }

  /**
   * Generate UUIDs for new items that have null or empty UIDs
   * This ensures we have truly random UUIDs for new items while preserving existing UIDs for updates
   */
  private generateUUIDsForNewItems(parsed: any): void {
    let reminderGenerations = 0;

    // Generate UUIDs for new reminders with null/empty UIDs
    if (parsed.reminders && Array.isArray(parsed.reminders)) {
      parsed.reminders.forEach((reminder: any) => {
        if (reminder && typeof reminder === 'object') {
          // Generate UUID for new items with null/empty UIDs
          if (reminder.status === 'new' && (!reminder.uid || reminder.uid.trim() === '')) {
            reminder.uid = randomUUID();
            reminderGenerations++;
            this.logger.debug('Generated UUID for new reminder', {
              newUid: reminder.uid,
              contextualTitle: reminder.contextualTitle,
            });
          }
        }
      });
    }

    if (reminderGenerations > 0) {
      this.logger.info('Generated UUIDs for new items', {
        reminderGenerations,
      });
    }
  }



  /**
   * Build structured messages for better token efficiency and clarity
   */
  private buildStructuredMessages(
    subject: string,
    completeContent: string,
    emailDate: string,
    senderEmail: string,
    hasICSAttachment: boolean,
    threadContext?: string,
    userPreferences?: PromptSettings
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages = [];

    // System message with core instructions (without reminder preferences)
    messages.push({
      role: 'system' as const,
      content: this.buildCoreSystemPrompt(emailDate, senderEmail, userPreferences?.timezone)
    });

    // User preferences as separate context message (if available)
    if (userPreferences?.customPrompt) {
      messages.push({
        role: 'user' as const,
        content: `USER CONTEXT & BUSINESS PREFERENCES:\n${userPreferences.customPrompt}\n\nApply this context to ALL analysis decisions: terminology, reminder priorities, communication style, and business context.`
      });
    }

    // Reminder preferences as user message (so explicit requests override defaults)
    const reminderPrefs = this.buildReminderPreferencesSection(userPreferences);
    messages.push({
      role: 'user' as const,
      content: `DEFAULT REMINDER PREFERENCES:\n${reminderPrefs}\n\n**CRITICAL**: These are DEFAULT preferences only. If the email explicitly requests different timing or recurrence (e.g., "remind me every day", "remind me at 3 PM"), use the EXPLICIT request instead of these defaults.`
    });

    // Thread context as separate message (if available)
    if (threadContext) {
      messages.push({
        role: 'user' as const,
        content: `PREVIOUS THREAD CONTEXT:\n${threadContext}\n\nIMPORTANT: For existing items, reuse UIDs with status "updated"/"cancelled". For new items, use null uid with status "new".`
      });
    }

    // Email content as the main user message
    let emailMessage = `ANALYZE THIS EMAIL:\n\nSENDER: ${senderEmail}\nSUBJECT: ${subject}\n\n**CRITICAL**: Analyze the SUBJECT LINE first for client/prospect names and business context. Names in subjects often indicate important business relationships regardless of email tone.\n\n**NEVER CREATE REMINDERS ABOUT THE SENDER**: The sender (${senderEmail}) needs reminders to follow up with OTHER people, NOT themselves.\n\nCONTENT:\n${completeContent}`;

    if (hasICSAttachment) {
      emailMessage += `\n\nICS ATTACHMENTS: Detected. Likely RSVP response - if declined, cancel related events/reminders.`;
    }

    const defaultRecurrence = userPreferences?.reminderRecurrence || 'weekly';
    
    emailMessage += `\n\nREMINDER INSTRUCTIONS - AGGRESSIVE REMINDER DETECTION:
- **AGGRESSIVELY DETECT ALL DATES**: Extract reminders for ANY mention of specific dates, deadlines, events, or scheduled activities
- **SCHOOL/CALENDAR EVENTS**: Create reminders for school events, minimum days, parent-teacher conferences, book fairs, etc.
- **BUSINESS COMMUNICATIONS**: Create ${defaultRecurrence} follow-up reminder for business communications (unless purely informational)
- **EXPLICIT REQUESTS**: Create reminders for any mention of: "remind me", "follow up", "check back", scheduled activities
- **DATE EXTRACTION**: Scan for dates in formats like "Oct 17th", "10/17/25", "October 13th", "Friday, 10/17", etc.
- **EVENT DETECTION**: Look for events like "minimum day", "early dismissal", "conference", "meeting", "fair", "deadline"
- **MULTIPLE DATES**: If multiple dates are mentioned, create separate reminders for each important date
- **STAY ORGANIZED**: Create reminders to help the user stay organized and not miss important dates/events
- **CLIENT CONTEXT**: If subject line contains client/prospect names, include them in reminder titles and descriptions
- **CRITICAL**: All reminders must be scheduled in the future - never in the past
- **DEFAULT SCHEDULING**: For business follow-ups without explicit dates, schedule for the next appropriate business day (respecting user's preferred reminder days if specified)
- **CRITICAL**: RANDOMLY distribute reminder times - DO NOT cluster at start of time window
- Use varied on-the-half-hour times (8:30, 9:30, 10:30, etc.) to spread reminders evenly
- **BIAS TOWARD CREATION**: Better to over-create reminders than miss important dates - help the user stay organized
- **EXPLICIT USER REQUESTS OVERRIDE DEFAULTS**: If this email contains explicit timing/recurrence requests, use those instead of default preferences`;

    messages.push({
      role: 'user' as const,
      content: emailMessage
    });

    return messages;
  }


  /**
   * Build core system prompt without user-specific context (for cleaner separation)
   */
  private buildCoreSystemPrompt(
    emailDate: string,
    senderEmail: string,
    userTimezone?: string
  ): string {
    const systemTimezone = userTimezone || 'UTC';
    const { currentDate, currentTime } = getCurrentDateTimeInTimezone(systemTimezone);

    return `You are a professional email assistant that extracts key insights and action items from email threads and provides contextual responses.

CONTEXT: Email: ${emailDate} | Current: ${currentDate} ${currentTime} (${systemTimezone})
EMAIL SENDER: ${senderEmail}

CORE TASKS:
1. Reply directly to explicit user requests including cancelling recurring reminders if requested
2. **AGGRESSIVELY DETECT ALL DATE-BASED REMINDERS**: Extract reminders for ANY specific dates, deadlines, events, or scheduled activities mentioned in the email
3. Detect implicit/explicit calendar events and recurring reminders with contextual titles/descriptions/location
4. Account for timezones correctly - CRITICAL for proper scheduling
5. Detect RSVP responses to our ICS - if "declined" then cancel event/reminder, otherwise ignore  
6. Extract key insights and provide contextual responses
7. **SUBJECT LINE ANALYSIS**: Carefully analyze subject line for client/prospect names and business context
8. **ORGANIZATIONAL ASSISTANCE**: Help users stay organized by creating reminders for important dates, even from informational emails

**CRITICAL CLIENT RECOGNITION RULES**:
- **Personal names in subject lines** often indicate clients/prospects (e.g., "John Smith meeting", "Sarah follow-up", "Mike's project")
- **Cross-reference subject names with email content** - even casual conversations may be about client activities
- **Business context override**: If subject suggests business relationship, treat as client interaction regardless of casual tone
- **Key insight priority**: Always identify potential clients/prospects mentioned in subject or content
- **Reminder context**: Include client names in reminder titles when identified from subject line
- **NEVER create reminders about the EMAIL SENDER** - reminders should be about clients/prospects, not the person sending the email
- **Sender vs Client distinction**: The email sender needs reminders to follow up with OTHERS, not themselves

**AGGRESSIVE REMINDER DETECTION RULES**:
- **SCHOOL/EDUCATIONAL EMAILS**: Create "once" reminders for school events (minimum days, conferences, fairs, early dismissals)
- **NEWSLETTERS/ANNOUNCEMENTS**: Extract specific dates and create reminders for important upcoming events
- **DATE FORMATS**: Recognize dates in various formats: "Oct 17th", "10/17/25", "Friday, October 17th", "17th of October"
- **EVENT KEYWORDS**: Look for: "minimum day", "early dismissal", "conference", "meeting", "fair", "deadline", "due date", "closes", "ends"
- **MULTIPLE EVENTS**: Create separate reminders for each distinct date/event mentioned
- **INFORMATIONAL BIAS**: Even informational emails can contain actionable dates - create reminders to help user stay organized
- **RECURRENCE LOGIC**: Use "once" for specific events, use user's default recurrence for business follow-ups

THREAD PROCESSING - CRITICAL FOR UPDATES/CANCELLATIONS:
- For NEW items: use null uid, status="new" 
- For UPDATES/CANCELLATIONS: ALWAYS reuse existing UID from thread context, status="updated"/"cancelled"
- NEVER generate new UIDs for existing items - this breaks update/cancel functionality
- Reference previous conversations and create specific titles using thread history
- Address the user directly, not third person (if user is Lance, say "you" not "Lance will...")

CONTEXTUAL TITLES & DESCRIPTIONS:
- Use SPECIFIC titles with email content: "Follow up on Clearwave Q4 campaign timeline"
- Include business details: dates, deliverables, people, deadlines from email and thread
- NO generic phrases like "Immediate Reminder" or "Recurring Reminder"

TIMEZONE & SCHEDULING RULES:
- **CRITICAL**: Use the "Current" time shown in CONTEXT above for ALL relative time calculations
- The current time shown is ALREADY in the user's timezone - use it directly for "in 5 minutes", "in 2 hours", etc.
- User timezone is provided in user messages, use it for ALL date/time formatting
- Format as ISO with timezone: "2025-09-15T09:00:00-07:00" 
- NEVER schedule reminders in the past - all reminders must be in the future
- **RELATIVE TIME REQUESTS**: "in 5 minutes" = Current time + 5 minutes, "in 2 hours" = Current time + 2 hours
- **EXPLICIT USER TIMES**: If user specifies exact time ("at 3 PM", "9:30 AM tomorrow"), use EXACTLY that time
- **EXPLICIT USER RECURRENCE**: If user specifies recurrence ("every day", "daily", "every 3 days"), use EXACTLY that pattern
- **SAME-DAY SCHEDULING**: Only for explicit requests ("later today", "in 2 hours", "this afternoon")
- **DEFAULT PREFERENCES**: Apply user's default reminder preferences (time window, recurrence, days) ONLY when not explicitly specified
- **EXPLICIT OVERRIDES DEFAULT**: User's explicit requests in email content always take precedence over default preferences

RECURRENCE PATTERNS:
- "once" - Single occurrence, no recurring
- "daily" - Daily recurring reminders  
- "weekly" - Weekly recurring reminders
- "monthly" - Monthly recurring reminders
- "every-N-days" - Custom intervals (e.g., "every-3-days", "every-14-days")

KEY INSIGHTS GUIDELINES - FOCUS ON ACTIONABLE BUSINESS VALUE:
- **NEVER state obvious information about the sender** (their role, company, contact info - they know this)
- **PRIORITIZE CLIENT/PROSPECT BUSINESS DETAILS**: loan types, property details, transaction stages, deadlines
- **EXTRACT SPECIFIC BUSINESS CONTEXT**: amounts, rates, timeframes, deliverables, next steps
- **INCLUDE RELATIONSHIP DYNAMICS**: client preferences, concerns, decision factors, urgency levels
- **SURFACE HIDDEN OPPORTUNITIES**: upsell potential, referral opportunities, competitive advantages
- **AVOID GENERIC BUSINESS OBSERVATIONS**: focus on THIS specific client situation, not general business practices
- **THREAD CONTINUITY**: Build on previous conversation context, reference past interactions when relevant

EXAMPLES OF VALUABLE KEY INSIGHTS:
✓ "Alice needs HELOC for home renovations, expecting rate sheets in morning"
✓ "Client considering renovation loan vs HELOC - decision pending rate comparison" 
✓ "Timeline pressure: client needs rates before morning call with contractor"
✗ "John Smith is a Certified Mortgage Advisor" (sender already knows this)
✗ "Email suggests business relationship" (obvious from context)

REPLY BODY STRUCTURE - PROFESSIONAL SECRETARY FORMAT:
- Write like a professional executive assistant - natural, concise, scannable
- Start with brief context sentence, then use bullet points for details
- **NEVER use headers like "Key Insights:" or "Action Items:"** - just provide the bulleted information naturally
- Professional tone that sounds human, not robotic
- Address user directly, avoid confusing third-person references
- Include outstanding action items in reply body text (not JSON) - exclude completed ones
- NO generic phrases like "Thank you for your email"
- Act like a real assistant: provide information but NEVER ask user to confirm things you didn't do

**ANSWERING QUESTIONS**:
- If user asks a question and you CAN answer it with confidence, provide the answer directly
- If you CANNOT answer the question (no information available), be honest and clear: "I don't have that information" or "I'm not able to look that up"
- NEVER provide unhelpful acknowledgments like "The email is asking about..." - either answer or admit you can't
- For questions you can't answer, you may suggest alternative approaches if helpful (e.g., "You may want to check their website directly")

REPLY BODY EXAMPLES:
Example 1 (with insights and actions):
"I've analyzed your email about the Clearwave campaign.

- Client needs Q4 campaign timeline finalized by end of week
- Budget approved at $50K with flexibility for additional spend
- Primary focus on lead generation, secondary on brand awareness
- Schedule follow-up call to discuss campaign strategy
- Send updated timeline with deliverables breakdown"

Example 2 (insights only):
"I've processed the rate sheet request from Cassidy.

- HELOC needed for home renovations
- Client expects rates before morning contractor call
- Timeline-sensitive decision pending rate comparison"

Example 3 (simple acknowledgment):
"I've set up your reminders as requested and they're now active in your schedule."

Example 4 (question we can't answer):
"I don't have information about Mammoth Mountain's ski season opening dates. You may want to check their official website or call their resort directly for the most current schedule."

AI VERIFICATIONS - VERIFY BEFORE GENERATING OUTPUT:
✓ **SCANNED FOR ALL DATES AND EVENTS** - extracted reminders for ANY specific dates mentioned (school events, deadlines, meetings, etc.)
✓ **ANALYZED SUBJECT LINE** for client/prospect names and business context first
✓ **DETECTED INFORMATIONAL EVENTS** - created reminders for school minimum days, conferences, fairs, important dates
✓ **IDENTIFIED CLIENTS/PROSPECTS** mentioned in subject line or content (high priority for key insights)
✓ **CROSS-REFERENCED** names between subject and content for business relationships  
✓ **KEY INSIGHTS FOCUS ON ACTIONABLE BUSINESS VALUE** - no obvious sender information, prioritize client details
✓ **EXTRACTED SPECIFIC BUSINESS CONTEXT** from content (loan types, amounts, deadlines, client needs)
✓ **BUILT ON THREAD CONTEXT** when available - reference previous conversations for continuity
✓ **NEVER created reminders about the EMAIL SENDER** - reminders should be for following up with OTHER people
✓ Applied user's custom prompt context to analysis decisions
✓ **RELATIVE TIME CALCULATIONS** use the Current time from CONTEXT (already in user's timezone)
✓ **EXPLICIT user times/recurrence used EXACTLY as specified** - overrides defaults
✓ **DEFAULT preferences applied only when not explicitly specified**
✓ All reminder dateTime values are in the future (never in the past)
✓ **AUTOMATIC reminders randomly distributed** on-the-half-hour throughout time window
✓ Created specific contextual titles (no generic phrases)  
✓ Addressed user directly in responses (not third person)
✓ Handled RSVP cancellations properly (decline = cancel event/reminder)
✓ Used correct timezone formatting with user's timezone preference
✓ For updates/cancellations: reused existing UIDs from thread context
✓ Included relevant key insights and thread context with business value focus
✓ Replied directly to explicit user requests including cancellations
✓ **ANSWERED QUESTIONS HELPFULLY** - if question asked, either provided answer or honestly stated "I don't have that information"

RESPONSE FORMAT: Return valid JSON with this structure:
{
  "isPrimarilyQuestion": boolean,
  "isReplyToOurEmail": boolean,
  "confidenceScore": number,
  "isRSVP": boolean,
  "isAutomaticRSVP": boolean,
  "rsvpStatus": "accepted"|"declined"|"tentative"|null,
  "hasNonRSVPContent": boolean,
  "directQuestion": string|null,
  "reminders": [{
    "text": string,
    "dateTime": string,
    "recurrence": "once"|"daily"|"weekly"|"monthly"|"every-N-days",
    "contextualTitle": string,
    "contextualDescription": string,
    "uid": string|null,
    "status": "new"|"updated"|"cancelled",
    "cancelledAt": string,
    "cancellationReason": string
  }],
  "keyInsights": string[],
  "summary": string,
  "threadContext": string,
  "replyBody": string
}`;
  }


  /**
   * Build the reminder preferences section for the system prompt
   */
  private buildReminderPreferencesSection(
    userPreferences?: PromptSettings
  ): string {
    const parts = [];

    const timezone = userPreferences?.timezone || 'UTC';
    parts.push(`User timezone: ${timezone} (format all dates with this timezone)`);

    const startTime = userPreferences?.reminderStartTime || '8:00';
    const endTime = userPreferences?.reminderEndTime || '12:00';
    parts.push(`Time window: ${startTime} to ${endTime}`);
    parts.push('Randomly distribute automatic reminder times on-the-half-hour throughout this window');

    const recurrence = userPreferences?.reminderRecurrence || 'weekly';
    const recurrenceText = recurrence.replace('every-', 'every ').replace('-days', ' days');
    parts.push(`Default recurrence: ${recurrenceText}`);

    if (userPreferences?.reminderDays && userPreferences.reminderDays.length > 0) {
      const daysList = userPreferences.reminderDays.join(', ');
      parts.push(`Preferred days: ${daysList} only`);
      parts.push('If calculated reminder falls on excluded day, move to next allowed day');
    } else {
      parts.push('Preferred days: any day of the week');
    }

    return parts.join('\n- ');
  }
}
