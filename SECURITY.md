# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability within LeadKeepr, please send an email to the security team. All security vulnerabilities will be promptly addressed.

Please include the following information in your report:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

## Security Best Practices

### Environment Variables

This project uses environment variables for all sensitive configuration:

- **OpenAI API Keys**: Set via `OPENAI_API_KEY`
- **AWS Credentials**: Managed via IAM roles (never hardcode)
- **Email Addresses**: Set via `REPLY_FROM_EMAIL`, `ALERT_EMAIL`

**Never commit `.env` files to version control.**

### Before Deploying

1. Review all environment variable configurations
2. Ensure AWS IAM roles follow least-privilege principles
3. Verify S3 buckets have public access blocked
4. Check that DynamoDB tables use appropriate access controls
5. Rotate any exposed secrets immediately

### AWS Security

- All S3 buckets use `BLOCK_ALL` public access by default
- DynamoDB tables use point-in-time recovery
- Lambda functions use execution roles with minimal permissions
- SQS queues include dead-letter queues for failed message handling
- CloudWatch logging is enabled (ensure no sensitive data is logged)

### Dependencies

- Regularly update dependencies using `npm audit` and `npm update`
- Review security advisories for AWS CDK and Lambda runtime dependencies
- Use `npm audit fix` to automatically patch known vulnerabilities

### Deployment Security

- Use separate AWS accounts for production, test, and development environments
- Enable CloudTrail for audit logging
- Configure AWS GuardDuty for threat detection
- Use AWS Secrets Manager for production secrets
- Enable MFA for AWS root and privileged accounts

## Security Features

### Infrastructure Security

- **IAM Roles**: Lambda functions use execution roles with scoped permissions
- **Encryption**: Data at rest (DynamoDB, S3) and in transit (HTTPS, AWS encryption)
- **Network Isolation**: Lambda functions run in AWS-managed VPCs
- **Access Control**: S3 bucket policies and DynamoDB IAM policies enforce least privilege

### Application Security

- **Input Validation**: Email content is validated and sanitized
- **Error Handling**: Sensitive error details are logged to CloudWatch, not exposed to users
- **Rate Limiting**: SQS visibility timeouts prevent excessive retries
- **Dead Letter Queues**: Failed messages are isolated for investigation

### Dependency Management

- TypeScript for type safety
- AWS Lambda Powertools for structured logging (no sensitive data in logs)
- Regular security updates via Dependabot (recommended to enable)

## Contact

For security concerns, please contact the maintainers through GitHub's private vulnerability reporting feature or via email.

---

Last updated: February 2026
