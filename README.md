# leadkeepr

An AI-powered email assistant that automatically processes incoming emails, extracts key information, and sends intelligent replies with calendar attachments. Built with AWS CDK and Lambda, it uses OpenAI for email analysis and generates ICS calendar events for reminders mentioned in email content.

## What It Does

leadkeepr automates your email workflow:

- **Email Processing**: Receives emails via SES, stores in S3, processes via Lambda
- **AI Analysis**: Uses OpenAI to extract reminders, action items, key insights, and generate summaries
- **Smart Replies**: Automatically composes and sends reply emails with extracted information
- **Calendar Integration**: Creates ICS calendar attachments for detected reminders and events
- **Thread Context**: Maintains conversation history to provide context-aware responses
- **Scheduled Reminders**: Uses EventBridge Scheduler to send follow-up emails at specified times

## Architecture

Serverless event-driven architecture:

- **Email Flow**: SES → S3 → SQS → Lambda
- **Compute**: AWS Lambda with PowerTools for structured logging and metrics
- **Infrastructure**: AWS CDK with nested stacks pattern (Data, Email, Security, Compute)
- **Storage**: DynamoDB (single-table design), S3 (email storage)
- **Scheduling**: EventBridge Scheduler → SQS → Lambda
- **AI**: OpenAI API for content analysis

## Quick Start

### Prerequisites

- **Node.js**: >= 20.0.0
- **npm**: >= 9.0.0
- **AWS CLI**: Configured with appropriate credentials
- **AWS CDK**: Installed automatically via npm
- **Route53 Hosted Zone**: Required for SES domain configuration
- **OpenAI API Key**: Required for email analysis

### 1. Setup

```bash
# Clone and install dependencies
git clone <repository-url>
cd leadkeepr
npm install
```

### 2. Configure Environment

```bash
# Copy environment template
cp cdk/.env.example cdk/.env.local

# Edit with your settings (see Configuration section below)
vim cdk/.env.local
```

### 3. Deploy Infrastructure

```bash
# Bootstrap CDK (first time only)
npm run cdk:bootstrap

# Build and deploy to test environment
npm run deploy:test
```

### 4. Post-Deployment Setup

After deployment, you must complete these manual steps:

**A. Activate SES Receipt Rule Set:**

```bash
# Get the rule set name from CDK outputs
RULE_SET_NAME=$(aws cloudformation describe-stacks --stack-name MainStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ReceiptRuleSetName`].OutputValue' \
  --output text)

# Set it as the active rule set
aws ses set-active-receipt-rule-set --rule-set-name "$RULE_SET_NAME"
```

**B. Create User Preferences Record:**

Create a DynamoDB record to enable email processing for your email address:

```bash
# Get the table name from CDK outputs
TABLE_NAME=$(aws cloudformation describe-stacks --stack-name MainStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DynamoDBTableName`].OutputValue' \
  --output text)

# Create user preferences record (replace user@example.com with your email)
aws dynamodb put-item --table-name "$TABLE_NAME" --item '{
  "pk": {"S": "user@example.com"},
  "sk": {"S": "PREFERENCES#USER"},
  "createdAt": {"S": "'$(date -Iseconds)'"},
  "emailVerified": {"BOOL": true},
  "updatedAt": {"S": "'$(date -Iseconds)'"}
}'
```

Replace `user@example.com` with the email address that will send emails to your assistant.

**C. Verify User Email in SES (Sandbox Mode):**

If your AWS account is in SES sandbox mode, you must verify the user's email address:

```bash
# Verify the email address that will send emails to the assistant
aws ses verify-email-identity --email-address user@example.com
```

Check the inbox for `user@example.com` and click the verification link. To check if you're in sandbox mode:

```bash
aws ses get-account-sending-enabled
```

To request production access and exit sandbox mode, visit the [SES Console](https://console.aws.amazon.com/ses/) and submit a sending limit increase request.

### 5. Development

Copy `cdk/.env.example` to `cdk/.env.test|prod` with your settings:

```bash
# AWS Configuration
AWS_REGION=us-east-1

# Route53 Configuration (Required)
HOSTED_ZONE_ID=Z1234567890ABC           # Your Route53 hosted zone ID
FQDN=example.com                        # Domain for email (e.g., assistant.yourdomain.com)

# Email Configuration (Required)
REPLY_FROM_EMAIL=assistant@example.com  # From address for reply emails

# AI Configuration (Required)
OPENAI_API_KEY=sk-...                   # OpenAI API key

# Optional
ALERT_EMAIL=alerts@example.com          # DMARC reports
LOG_LEVEL=INFO                          # DEBUG, INFO, WARN, ERROR
```

## Development Commands

```bash
# Build
npm run build:all        # Build lambdas + CDK
npm run build:lambdas    # Build only lambda functions
npm run build:cdk        # Build only CDK infrastructure

# Deploy
npm run deploy:test      # Build + deploy to test environment
npm run deploy:prod      # Build + deploy to production
npm run cdk:diff         # Preview infrastructure changes

# Development
npm run cdk:watch        # Watch mode - auto-deploy infrastructure changes

# Testing
npm run test             # Run all tests
npm run test:lambda      # Lambda tests only
npm run test:lambda-file -- <pattern>  # Test specific files
```

## Project Structure

```text
├── cdk/                           # AWS CDK infrastructure
│   ├── lib/
│   │   ├── main-stack.ts         # Main orchestration stack
│   │   └── stacks/               # Nested stacks
│   │       ├── data-stack.ts     # DynamoDB, S3, SQS
│   │       ├── email-stack.ts    # SES configuration
│   │       ├── security-stack.ts # IAM roles
│   │       ├── compute-stack.ts  # Lambda orchestration
│   │       ├── email-processing-stack.ts  # Email handler
│   │       └── reminder-stack.ts # Reminder processor
│   └── app.ts                    # CDK app entry point
├── lambda/                        # Lambda functions
│   ├── src/
│   │   ├── email-handler/        # Main email processor
│   │   ├── reminder-processor/   # Scheduled reminder handler
│   │   └── shared/               # Shared utilities/services
│   └── esbuild.config.js         # Lambda bundling config
└── scripts/                      # Deployment utilities
```

## Key Features

- **Multi-Environment**: Separate dev/test/prod deployments via CDK context
- **Event-Driven Architecture**: SES → S3 → SQS → Lambda processing pipeline
- **Thread Context**: Maintains email conversation history for context-aware responses
- **ICS Calendar Generation**: Automatically creates calendar attachments for reminders
- **Scheduled Reminders**: EventBridge Scheduler triggers follow-up emails
- **Claim-Check Pattern**: SQS messages reference S3 objects to handle large emails
- **Single-Table Design**: DynamoDB with partition/sort key for efficient queries

## Troubleshooting

**Common Issues:**

1. **SES Domain Verification**: Ensure Route53 hosted zone has SES verification records
2. **Lambda Timeouts**: Check CloudWatch logs in `/aws/lambda/email-handler` and `/aws/lambda/reminder-processor`
3. **SQS Dead Letter Queues**: Monitor DLQs for failed message processing
4. **Build Failures**: Run `npm run clean` then `npm run build:all`

**Useful Commands:**

```bash
# Preview infrastructure changes
npm run cdk:diff

# View CloudFormation stack events
aws cloudformation describe-stack-events --stack-name MainStack

# Check SQS queue depth
aws sqs get-queue-attributes --queue-url <queue-url> --attribute-names ApproximateNumberOfMessages

# View recent Lambda logs
aws logs tail /aws/lambda/email-handler --follow
```

## Email Processing Flow

1. **Incoming Email**: SES receives email and stores to S3 bucket (`incoming-emails/` prefix)
2. **S3 Notification**: S3 triggers SQS message with object metadata
3. **Email Handler**: Lambda processes SQS message:
   - Retrieves email from S3
   - Parses email content and attachments
   - Fetches thread context from DynamoDB
   - Calls OpenAI API for intent analysis
   - Generates ICS attachments for reminders
   - Stores email metadata in DynamoDB
   - Sends reply email via SES
   - Creates EventBridge schedules for reminders
4. **Reminder Processor**: Lambda triggered by scheduled SQS messages:
   - Retrieves reminder details from DynamoDB
   - Generates follow-up email content
   - Sends reminder email via SES

## Contributing

1. Follow existing patterns in [`lambda/src/shared/`](lambda/src/shared/) for utilities
2. Use `createCleanSQSHandler()` wrapper for all Lambda handlers
3. Implement dependency injection via factory pattern (see `dependencies.ts` files)
4. Run tests before committing: `npm run test:lambda`
5. Check for errors: `npm run lint`

For detailed development guidelines, see [`.github/copilot-instructions.md`](.github/copilot-instructions.md).
