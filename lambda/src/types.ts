export const DAYS_OF_WEEK = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/**
 * Base DynamoDB item structure
 */
export interface DynamoDBItem {
  pk: string;
  sk: string;
}

export const DDB_PREFIXES = {
  ATTACHMENT: 'ATTACHMENT#',
  EMAIL: 'EMAIL#',
  MSG: 'MSG#',
  PREFERENCES: 'PREFERENCES#',
  THREAD: 'THREAD#',
};

export type EntityType = 'email' | 'attachment' | 'preferences' | 'unknown';

/**
 * Email attachment types
 */
export type AttachmentType = 'email' | 'image' | 'document' | 'other';

/**
 * Email attachment structure
 */
export interface EmailAttachment {
  filename?: string;
  contentType?: string;
  size?: number;
  type?: AttachmentType;
  contentId?: string; // Content-ID header for embedded images
  disposition?: string; // Content-Disposition (inline, attachment, etc.)
}

export interface EmailAttachmentICS {
  filename: string;
  content: string;
  contentType: string;
  uid: string;
}

/**
 * Complete parsed email metadata
 */
export interface IncomingEmailParsed {
  messageId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  inReplyTo?: string;
  references?: string | string[];
  emailDate: string; // ISO string with timezone preserved
  attachments: EmailAttachment[];
  emailTextContent?: string; // Extracted email content (if no attachments)
  rawEmailContent?: string; // Complete raw email content with headers (for pre-formatted emails)
  // Email client headers for provider detection
  xMailer?: string; // X-Mailer header
  userAgent?: string; // User-Agent header
}

/**
 * Flexible recurrence pattern type
 * Supports once, daily, weekly, monthly, and custom day intervals
 */
export type Recurrence = 'daily' | 'weekly' | 'monthly' | `every-${number}-days`;

/**
 * Reminder request extracted from email content
 */
export interface Reminder {
  text: string; // Original reminder text from email
  dateTime: string; // ISO datetime when reminder should trigger
  recurrence: 'once' | Recurrence; // Flexible recurrence pattern
  contextualTitle: string; // Contextual Title
  contextualDescription: string; // Contextual Description
  uid: string; // UID for updates/cancellations
  status?: 'new' | 'updated' | 'cancelled'; // Item status
  cancelledAt?: string; // ISO timestamp when cancelled
  cancellationReason?: string; // Reason for cancellation
}

/**
 * Complete analysis of an email's intent and content
 */
export interface EmailIntentAnalysis {
  // Email purpose identification
  isPrimarilyQuestion: boolean;
  isReplyToOurEmail: boolean;
  confidenceScore: number; // 0-1

  // RSVP detection
  isRSVP: boolean;
  isAutomaticRSVP: boolean;
  rsvpStatus?: 'accepted' | 'declined' | 'tentative';
  hasNonRSVPContent: boolean;

  // Extracted data
  directQuestion?: string;
  reminders: Reminder[]; // Changed to array to support multiple reminders
  keyInsights: string[];

  // Content summary
  summary: string;
  threadContext?: string;

  // Generated reply body
  replyBody: string;
}

export interface EmailIntentAnalysisItems {
  reminders: Reminder[];
}

export interface PromptSettings {
  timezone?: string; // IANA identifier e.g., "America/Los_Angeles" for Pacific Time

  customPrompt?: string; // AI customization instructions for their use case

  // Reminder scheduling preferences
  reminderDays?: DayOfWeek[]; // Specific days of the week
  reminderEndTime?: string; // HH:MM format, end of reminder window
  reminderRecurrence?: Recurrence; // Default recurrence pattern
  reminderStartTime?: string; // HH:MM format, start of reminder window
}

/**
 * User preferences record as stored in DynamoDB
 */
export interface UserPreferencesRecord extends DynamoDBItem, PromptSettings {
  // Primary keys
  pk: string; // user email address
  sk: string; // PREFERENCES#USER

  // User customization preferences
  primaryUseCase?: string; // Brief description of their main workflow

  // Email verification tracking (for custom verification when SES sandbox disabled)
  emailVerified?: boolean; // Whether the email address has been verified
  verificationNonce?: string; // Unique nonce for email verification link
  verificationNonceExpiresAt?: string; // ISO timestamp when verification nonce expires

  createdAt: string; // ISO timestamp when preferences were created
  updatedAt: string; // ISO timestamp when preferences were last updated
}

/**
 * Email record as stored in DynamoDB - unified interface for both handlers
 */
export interface EmailRecord extends DynamoDBItem {
  // Primary keys
  pk: string; // sender email address (sanitized)
  sk: string; // EMAIL#{emailDate}#{messageId}

  // GSI keys for thread-based queries
  gsi1Pk: string; // {pk}#{threadId} - user-scoped thread ID for replies (e.g., "user@example.com#msg1234@foo.org")
  gsi1Sk: string; // {emailDate}#{messageId} - for chronological ordering within thread

  // Basic email metadata
  messageId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  emailDate: string; // ISO 8601 timestamp
  s3Key: string; // S3 object key for raw email content

  // Thread detection
  inReplyTo?: string;
  references: string;
  threadId: string; // The root message ID of the thread
  isReplyToOurEmail: boolean;

  // Email content and analysis (from email-handler)
  completeEmailContent: string; // Full email text content for AI context
  emailIntentAnalysis: EmailIntentAnalysis; // AI analysis results

  // Processing metadata
  createdAt: string; // ISO timestamp when email record was created
  updatedAt: string; // ISO timestamp when email record was last updated

  // Attachment metadata (summary only)
  hasAttachments: boolean;
  attachmentCount: number;
}

export interface EventMetadata {
  eventName: 'INSERT' | 'MODIFY';
  tableName: string;
  entityType: 'email';
}

export interface EmailAnalyzedEventDetail extends EventMetadata {
  data: EmailRecord;
}
