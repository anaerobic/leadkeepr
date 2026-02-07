/**
 * Enhanced Email stack - automatically manages ALL SES and Route53 email resources.
 *
 * Features:
 * ✅ Automated SES domain verification (custom resource)
 * ✅ Automatic A record creation (prevents HOST_NOT_FOUND errors)
 * ✅ DKIM CNAME records (via EmailIdentity construct)
 * ✅ SPF TXT records for domain and mail subdomain
 * ✅ MX records for inbound and feedback emails
 * ✅ DMARC TXT record with proper policy
 * ✅ SES receipt rules and S3 integration
 * ✅ Region-specific naming to avoid conflicts
 */

import * as cdk from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import * as path from 'path';

export interface EmailStackProps extends cdk.NestedStackProps {
  readonly alertEmail?: string; // Optional: Email for DMARC reports
  readonly emailBucket: s3.Bucket;
  readonly environment: string;
  readonly fqdn: string;
  readonly hostedZoneId: string;
  readonly hostedZoneName: string;
  readonly hostRecordIp?: string; // IP for A record (defaults to 127.0.0.1)
  readonly replyFromEmail: string; // Email address allowed for sending
  readonly subdomain?: string;
}

/**
 * Enhanced nested stack for email and DNS resources with full automation.
 */
export class EmailStack extends cdk.NestedStack {
  public readonly sesConfigSet: ses.CfnConfigurationSet;
  public readonly sesConfigurationSetName: string;
  public readonly sesEventTopics: {
    bounce: sns.Topic;
    complaint: sns.Topic;
    delivery: sns.Topic;
  };
  public readonly sesIdentities: { domain: ses.EmailIdentity };
  public readonly route53Records: { [key: string]: route53.RecordSet | cdk.CfnOutput };
  public readonly sesReceiptRules: { [key: string]: ses.CfnReceiptRuleSet | ses.CfnReceiptRule };
  public readonly verifiedEmailIdentities: { [key: string]: ses.EmailIdentity };
  public readonly sesVerificationRecords: { [key: string]: cdk.CustomResource };
  public readonly sesSendingRestrictionPolicy: iam.ManagedPolicy;
  private readonly props: EmailStackProps;
  private readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: EmailStackProps) {
    super(scope, id, props);

    // Store references
    this.props = props;
    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });

    // Create SNS topics for SES events
    this.sesEventTopics = this.createSesEventTopics();

    // SES configuration for email processing with event destinations
    this.sesConfigSet = this.createSesConfigurationSet();
    this.sesConfigurationSetName = this.sesConfigSet.name!;

    // Create A record for the subdomain if requested (fixes HOST_NOT_FOUND)
    if (props.subdomain) {
      this.createHostRecord(props.subdomain, props.hostRecordIp);
    }

    // SES domain identity (must be created before verification records)
    this.sesIdentities = this.createSesIdentities();

    // Automated SES verification and DKIM records
    this.sesVerificationRecords = this.createAutomatedSesVerification();

    // Standard Route53 DNS records (SPF, MX)
    this.route53Records = this.createRoute53SesRecords(props.subdomain);

    // DMARC record (optional - only if alertEmail provided)
    if (props.alertEmail) {
      this.createDmarcRecord(props.subdomain);
    }

    // Complete SES configuration with receipt rules
    this.sesReceiptRules = this.createSesReceiptRules(props.replyFromEmail);

    // Outputs
    this.createOutputs();
  }

  /**
   * Get DNS record name without region prefix.
   */
  private getDnsRecordName(baseName?: string): string {
    // Return the baseName as-is, or empty string for root domain
    if (!baseName || baseName.trim() === '') {
      return '';
    }

    return baseName;
  }

  /**
   * Create SNS topics for SES event notifications.
   */
  private createSesEventTopics(): {
    bounce: sns.Topic;
    complaint: sns.Topic;
    delivery: sns.Topic;
  } {
    const bounceTopic = new sns.Topic(this, 'SesBounceTopic', {
      topicName: `ses-bounces-${this.region}`,
      displayName: 'SES Bounce Notifications',
    });

    const complaintTopic = new sns.Topic(this, 'SesComplaintTopic', {
      topicName: `ses-complaints-${this.region}`,
      displayName: 'SES Complaint Notifications',
    });

    const deliveryTopic = new sns.Topic(this, 'SesDeliveryTopic', {
      topicName: `ses-deliveries-${this.region}`,
      displayName: 'SES Delivery Notifications',
    });

    return {
      bounce: bounceTopic,
      complaint: complaintTopic,
      delivery: deliveryTopic,
    };
  }

  /**
   * Create SES configuration set for email processing with event destinations (region-specific).
   */
  private createSesConfigurationSet(): ses.CfnConfigurationSet {
    const configSet = new ses.CfnConfigurationSet(this, 'SesConfigSet', {
      name: 'ses-config-set',
    });

    // Create event destinations for bounces, complaints, and deliveries
    new ses.CfnConfigurationSetEventDestination(this, 'SesEventDestinationBounce', {
      configurationSetName: configSet.name!,
      eventDestination: {
        name: 'bounce-destination',
        enabled: true,
        matchingEventTypes: ['bounce'],
        snsDestination: {
          topicArn: this.sesEventTopics.bounce.topicArn,
        },
      },
    });

    new ses.CfnConfigurationSetEventDestination(this, 'SesEventDestinationComplaint', {
      configurationSetName: configSet.name!,
      eventDestination: {
        name: 'complaint-destination',
        enabled: true,
        matchingEventTypes: ['complaint'],
        snsDestination: {
          topicArn: this.sesEventTopics.complaint.topicArn,
        },
      },
    });

    new ses.CfnConfigurationSetEventDestination(this, 'SesEventDestinationDelivery', {
      configurationSetName: configSet.name!,
      eventDestination: {
        name: 'delivery-destination',
        enabled: true,
        matchingEventTypes: ['delivery'],
        snsDestination: {
          topicArn: this.sesEventTopics.delivery.topicArn,
        },
      },
    });

    return configSet;
  }

  /**
   * Create A record for the subdomain to prevent HOST_NOT_FOUND errors.
   */
  private createHostRecord(subdomain?: string, ip?: string): route53.ARecord {
    const recordName = this.getDnsRecordName(subdomain);
    const ipAddress = ip || '127.0.0.1';

    return new route53.ARecord(this, 'HostRecord', {
      zone: this.hostedZone,
      recordName: recordName,
      target: route53.RecordTarget.fromIpAddresses(ipAddress),
      ttl: cdk.Duration.minutes(5),
      comment: `A record for ${this.props.fqdn} to support SES domain verification`,
    });
  }

  /**
   * Create SES domain identity (allows sending from any email on the domain).
   */
  private createSesIdentities(): { domain: ses.EmailIdentity } {
    // Create the email identity for the domain with DKIM
    const domainIdentity = new ses.EmailIdentity(this, 'EmailDomainIdentity', {
      identity: ses.Identity.domain(this.props.fqdn),
      dkimSigning: true,
      mailFromDomain: `mail.${this.props.fqdn}`,
    });

    return {
      domain: domainIdentity,
    };
  }

  /**
   * Create automated SES verification records using custom resources.
   */
  private createAutomatedSesVerification(): {
    [key: string]: cdk.CustomResource;
  } {
    // Create a log group for the SES verification provider
    const sesVerificationLogGroup = new cdk.aws_logs.LogGroup(this, 'SesVerificationLogGroup', {
      logGroupName: '/aws/lambda/ses-verification',
      retention: cdk.aws_logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Custom resource to get SES verification token and create DNS record
    const sesVerificationProvider = new cr.Provider(this, 'SesVerificationProvider', {
      onEventHandler: this.createSesVerificationLambda(),
      logGroup: sesVerificationLogGroup,
    });

    const sesVerificationResource = new cdk.CustomResource(this, 'SesVerificationResource', {
      serviceToken: sesVerificationProvider.serviceToken,
      properties: {
        DomainName: this.props.fqdn,
        HostedZoneId: this.hostedZone.hostedZoneId,
        Region: this.region,
      },
    });

    // Ensure this runs after the domain identity is created
    sesVerificationResource.node.addDependency(this.sesIdentities.domain);

    return {
      verification: sesVerificationResource,
    };
  }

  /**
   * Create Lambda function for SES verification automation.
   */
  private createSesVerificationLambda(): lambda.Function {
    return new lambda.Function(this, 'SesVerificationHandler', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'ses_verification_handler.handler',
      timeout: cdk.Duration.minutes(5),
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda')),
      role: this.createSesVerificationRole(),
    });
  }

  /**
   * Create IAM role for SES verification Lambda.
   */
  private createSesVerificationRole(): iam.Role {
    const role = new iam.Role(this, 'SesVerificationRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ses:VerifyDomainIdentity',
          'ses:GetIdentityVerificationAttributes',
          'ses:DeleteIdentity',
        ],
        resources: ['*'],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'route53:ChangeResourceRecordSets',
          'route53:ListResourceRecordSets',
          'route53:GetChange',
        ],
        resources: [
          `arn:aws:route53:::hostedzone/${this.hostedZone.hostedZoneId}`,
          'arn:aws:route53:::change/*',
        ],
      })
    );

    return role;
  }

  /**
   * Create DMARC record for email authentication.
   */
  private createDmarcRecord(subdomain?: string): route53.TxtRecord {
    const recordName = subdomain ? `_dmarc.${subdomain}` : '_dmarc';

    // Start with a permissive DMARC policy for initial setup
    const dmarcPolicy = `v=DMARC1; p=none; rua=mailto:${this.props.alertEmail}; ruf=mailto:${this.props.alertEmail}; sp=none; adkim=r; aspf=r;`;

    return new route53.TxtRecord(this, 'DmarcRecord', {
      zone: this.hostedZone,
      recordName,
      values: [dmarcPolicy],
      ttl: cdk.Duration.minutes(5),
      comment: `DMARC policy for ${this.props.fqdn}`,
    });
  }

  /**
   * Create Route53 DNS records for SES verification and DKIM.
   */
  private createRoute53SesRecords(subdomain?: string): {
    [key: string]: route53.RecordSet | cdk.CfnOutput;
  } {
    const recordName = this.getDnsRecordName(subdomain);

    // SPF record for email authentication (region-specific)
    const spfRecord = new route53.TxtRecord(this, 'EmailAuthSPF', {
      zone: this.hostedZone,
      recordName,
      values: ['v=spf1 include:amazonses.com ~all'],
      ttl: cdk.Duration.minutes(5),
    });

    // MX record for receiving emails (region-specific)
    const mxRecord = new route53.MxRecord(this, 'InboundMX', {
      zone: this.hostedZone,
      recordName,
      values: [
        {
          hostName: `inbound-smtp.${this.region}.amazonaws.com`,
          priority: 10,
        },
      ],
      ttl: cdk.Duration.minutes(5),
    });

    const mailRecordName = this.getDnsRecordName(subdomain ? `mail.${subdomain}` : 'mail');

    // MX record for feedback (mail subdomain, region-specific)
    const mailMxRecord = new route53.MxRecord(this, 'FeedbackMX', {
      zone: this.hostedZone,
      recordName: mailRecordName,
      values: [
        {
          hostName: `feedback-smtp.${this.region}.amazonses.com`,
          priority: 10,
        },
      ],
      ttl: cdk.Duration.minutes(5),
    });

    // SPF record for mail subdomain (region-specific)
    const mailSpfRecord = new route53.TxtRecord(this, 'MailSubdomainSPF', {
      zone: this.hostedZone,
      recordName: mailRecordName,
      values: ['v=spf1 include:amazonses.com ~all'],
      ttl: cdk.Duration.minutes(5),
    });

    return {
      spfRecord,
      mxRecord,
      mailMxRecord,
      mailSpfRecord,
    };
  }

  /**
   * Create SES receipt rules for email processing.
   */
  private createSesReceiptRules(replyFromEmail: string): {
    [key: string]: ses.CfnReceiptRuleSet | ses.CfnReceiptRule;
  } {
    // Grant SES permission to write to the S3 bucket for both incoming and support emails
    this.props.emailBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowSESPutObject',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [`${this.props.emailBucket.bucketArn}/incoming-emails/${this.region}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      })
    );

    // Create SES receipt rule set for email processing
    const ruleSet = new ses.CfnReceiptRuleSet(this, 'SesReceiptRuleSet', {
      ruleSetName: 'receipt-rule-set',
    });

    // Create SES receipt rule to store emails in S3
    const receiptRule = new ses.CfnReceiptRule(this, 'SesEmailRule', {
      ruleSetName: ruleSet.ruleSetName!,
      rule: {
        name: `${replyFromEmail.replace('@', '-at-')}-to-s3`,
        enabled: true,
        recipients: [replyFromEmail],
        actions: [
          {
            s3Action: {
              bucketName: this.props.emailBucket.bucketName,
              objectKeyPrefix: `incoming-emails/${this.region}/`,
            },
          },
        ],
        scanEnabled: true,
      },
    });

    return {
      ruleSet,
      receiptRule,
    };
  }

  /**
   * Create CloudFormation outputs.
   */
  private createOutputs(): void {
    // Note: DKIM tokens are not directly accessible from the L2 EmailIdentity construct
    // DKIM records are automatically created and managed by the construct

    // Output SES domain identity
    new cdk.CfnOutput(this, 'SesDomainIdentity', {
      value: this.props.fqdn,
      description: 'SES domain identity for email sending',
    });

    // Output SES configuration set name (region-specific)
    new cdk.CfnOutput(this, 'SesConfigSetName', {
      value: this.sesConfigSet.name || 'ses-config-set',
      description: 'SES configuration set name',
    });

    // Output S3 bucket information for email storage
    new cdk.CfnOutput(this, 'EmailStorageBucket', {
      value: this.props.emailBucket.bucketName,
      description: 'S3 bucket where incoming emails are stored',
    });

    new cdk.CfnOutput(this, 'EmailStoragePrefix', {
      value: `incoming-emails/${this.region}/`,
      description: 'S3 prefix for stored email objects',
    });

    new cdk.CfnOutput(this, 'SesVerificationStatus', {
      value: 'Automated via CDK Custom Resource',
      description: 'SES domain verification is handled automatically',
    });

    new cdk.CfnOutput(this, 'SesConfigurationSetName', {
      value: this.sesConfigurationSetName,
      description: 'SES configuration set name for attaching to outgoing emails',
    });

    new cdk.CfnOutput(this, 'SesMailFromDomain', {
      value: `mail.${this.props.fqdn}`,
      description: 'Custom MAIL FROM domain for SES',
    });
  }
}
