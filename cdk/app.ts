#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MainStack } from './lib/main-stack';
import { splitFqdn } from './lib/utils/domain-utils';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from specified env file or default to .env.local
const envFile = process.env.ENV_FILE || '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const app = new cdk.App();

// Get account and region from context or environment variables
// CDK will use the current AWS credentials to determine the account
const region =
  app.node.tryGetContext('region') || process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION;
const environment = app.node.tryGetContext('environment') || process.env.ENVIRONMENT || 'dev';

const alertEmail = process.env.ALERT_EMAIL; // Optional: for DMARC reports
const fqdn = process.env.FQDN!;
const hostedZoneId = process.env.HOSTED_ZONE_ID!;

// Split FQDN to get subdomain and hosted zone name
const { hostedZoneName } = splitFqdn(fqdn);

const logLevel = process.env.LOG_LEVEL || 'INFO';
const openaiApiKey = process.env.OPENAI_API_KEY!;
const replyFromEmail = process.env.REPLY_FROM_EMAIL!;
// Remove environment-specific naming since each environment has its own account
const scheduleGroupName = 'reminder-schedules';

new MainStack(app, 'MainStack', {
  env: {
    region,
  },
  alertEmail,
  environment,
  fqdn,
  hostedZoneId,
  hostedZoneName,
  logLevel,
  openaiApiKey,
  replyFromEmail,
  scheduleGroupName,
});
