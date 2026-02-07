# Codebase Instructions

An AI-powered email assistant that automatically processes incoming emails via AWS SES, uses OpenAI for content analysis, and sends intelligent replies with ICS calendar attachments. Built with AWS CDK and Lambda, it uses DynamoDB for state management and EventBridge Scheduler for follow-up reminders.

## Architecture Overview

**Multi-workspace monorepo**: Root `package.json` orchestrates 2 workspaces: `cdk/`, `lambda/`

- **CDK (`cdk/`)**: AWS infrastructure as code with nested stacks pattern
- **Lambda (`lambda/`)**: Two serverless functions bundled with ESBuild
  - `email-handler`: Processes incoming emails from SQS, analyzes with OpenAI, sends replies
  - `reminder-processor`: Handles scheduled reminders triggered by EventBridge Scheduler

**Key AWS Services**: SES (email), S3 (email storage), SQS (message queues), Lambda (compute), DynamoDB (state), EventBridge Scheduler (reminders)

**Data Flow**: 
- **Incoming**: SES → S3 → SQS → Lambda (email-handler) → DynamoDB/SES/Scheduler
- **Reminders**: EventBridge Scheduler → SQS → Lambda (reminder-processor) → SES

## Critical Development Patterns

### Stack Architecture (CDK)

- **MainStack** orchestrates nested stacks: Data, Email, Security, Compute
- **DataStack**: DynamoDB table, S3 bucket, SQS queues (incoming email + reminders), EventBridge Scheduler group
- **EmailStack**: SES domain configuration, receipt rule set, verification
- **SecurityStack**: IAM execution roles for Lambda and EventBridge Scheduler
- **ComputeStack** orchestrates:
  - **EmailProcessingStack**: Lambda function triggered by SQS, processes emails with OpenAI
  - **ReminderStack**: Lambda function triggered by scheduled SQS messages
- Environment-specific deployment with context: `--context environment=prod/test/dev`

### Lambda Patterns

- **Handler wrapper**: All handlers use `createCleanSQSHandler()` from `lambda/src/shared/lambda-utils.ts`
  - Provides PowerTools logger, metrics, and tracer
  - Validates required environment variables
  - Handles errors and metric publishing
- **ESBuild bundling**: Single `esbuild.config.js` builds both functions, stubs heavy dependencies (pdf-parse, canvas)
- **Dependency injection**: Each handler has `dependencies.ts` factory for service composition
- **Testing**: Jest with separate projects for `cdk` and `lambda`, PowerTools mocks in `__mocks__/`
- **DRY/SRP**: Shared utilities in `lambda/src/shared/`:
  - AWS service wrappers (`aws/`)
  - Repositories for DynamoDB access (`repositories/`)
  - Services for business logic (`services/`)
  - Utilities for formatting, dates, validation (`utils/`)

### Build & Deploy Workflows

```bash
# Full build chain
npm run build:all        # builds lambdas + cdk
npm run deploy:prod      # builds lambdas + deploys to prod
npm run deploy:test      # builds lambdas + deploys to test

# Development iteration
npm run cdk:watch        # hot reload CDK changes
npm run test:lambda-file -- <pattern>  # test specific lambda files
```

### Environment Configuration

- **Multi-environment**: `.env.prod`, `.env.test`, `.env.local` files
- **Context-based**: CDK reads environment from `--context environment=<env>`
- **Per-workspace**: Each workspace has environment-specific builds

### Testing Strategy

- **Lambda tests**: Located in `src/**/__tests__/` with PowerTools mocks via `shared/test-utils/`
- **Service isolation**: Tests use dependency injection with mocked AWS services
- **File-based testing**: `npm run test:lambda-file -- <pattern>` for targeted testing

## Key Files & Conventions

- **`cdk/lib/main-stack.ts`**: Infrastructure orchestration entry point
- **`lambda/src/shared/lambda-utils.ts`**: Standard handler wrapper (`createCleanSQSHandler()`) with PowerTools
- **`lambda/src/email-handler/`**: Main email processing logic
  - `index.ts`: SQS handler entry point
  - `dependencies.ts`: Factory for service composition
  - `processors/regular-email-processor.service.ts`: Core email processing orchestration
  - `services/`: Email parsing, OpenAI analysis, attachment processing
- **`lambda/src/reminder-processor/`**: Scheduled reminder logic
  - `index.ts`: SQS handler entry point for scheduled messages
  - `dependencies.ts`: Factory for service composition
  - `processors/reminder-processor.ts`: Reminder email generation and sending
- **`lambda/src/shared/`**: Shared utilities and services
  - `aws/`: AWS SDK wrappers (DynamoDB, S3, SES, Scheduler, etc.)
  - `repositories/`: Data access layer for DynamoDB
  - `services/`: Reusable business logic (OpenAI, email sending, thread context, etc.)
  - `utils/`: Formatting, dates, validation, email building
- **`lambda/esbuild.config.js`**: Build configuration for both Lambda functions

## Development Principles

- **Never implement backwards-compatibility** or migration logic unless explicitly requested
- **Never create documentation, scripts, or tests** unless explicitly requested
- **Always maintain SRP and DRY** - search existing shared utilities before implementing new helpers
- **Always use best practices** for each technology stack and ask for documentation links when uncertain:
  - AWS wrappers for proper abstraction of business logic from infrastructure
  - Jest ES6 auto-mocking patterns for clean test isolation
  - TypeScript strict typing and modern language features
  - Leverage AWS CDK and AWS Documentation for authoritative guidance

## External Dependencies

- **AI Processing**: OpenAI API (GPT-4) for email intent analysis, reminder extraction, reply generation
- **Email Processing**: 
  - SES for receiving and sending emails
  - S3 for email object storage (90-day lifecycle)
  - mailparser for MIME parsing
  - ical.js for ICS attachment parsing
  - ical-generator for ICS attachment creation
- **Monitoring**: CloudWatch Logs for all Lambda functions, optional SNS alerts for failures

## Development Commands

```bash
# Build & test
npm run build:all        # build lambdas + cdk
npm run build:lambdas    # esbuild both lambda functions
npm run test:lambda      # run lambda-specific tests only
npm run test:lambda-file -- <pattern>  # test specific files
npm run cdk:diff         # preview infrastructure changes

# Deploy
npm run cdk:synth        # generate CloudFormation templates
npm run deploy:test      # build + deploy to test environment
npm run deploy:prod      # build + deploy to production
npm run cdk:watch        # watch mode for infrastructure changes
```

Focus on the nested stack pattern in CDK, PowerTools-based Lambda architecture, and multi-environment deployment strategy when making changes.
