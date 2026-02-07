/**
 * CDK configuration constants and defaults
 */

export const AWS_CONFIG = {
  // PowerTools layer versions by region
  POWERTOOLS_LAYER_ARNS: {
    'us-east-1': 'arn:aws:lambda:us-east-1:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:35',
    'us-west-1': 'arn:aws:lambda:us-west-1:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:35',
    'us-west-2': 'arn:aws:lambda:us-west-2:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:35',
    'eu-west-1': 'arn:aws:lambda:eu-west-1:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:35',
    // Add more regions as needed
  } as Record<string, string>,

  // Default configurations
  DEFAULTS: {
    LAMBDA_TIMEOUT_MINUTES: 1,
    LAMBDA_MEMORY_MB: 512,
    LOG_RETENTION_DAYS: 1,
    POWERTOOLS_LOG_LEVEL_PROD: 'INFO',
    POWERTOOLS_LOG_LEVEL_DEV: 'DEBUG',
    POWERTOOLS_SAMPLE_RATE_PROD: '0.1',
    POWERTOOLS_SAMPLE_RATE_DEV: '1',
  },
} as const;

export const ENVIRONMENT_CONFIG = {
  // Environment-specific settings
  PRODUCTION: {
    logLevel: AWS_CONFIG.DEFAULTS.POWERTOOLS_LOG_LEVEL_PROD,
    sampleRate: AWS_CONFIG.DEFAULTS.POWERTOOLS_SAMPLE_RATE_PROD,
    memorySize: 1024, // More memory for production
  },
  DEVELOPMENT: {
    logLevel: AWS_CONFIG.DEFAULTS.POWERTOOLS_LOG_LEVEL_DEV,
    sampleRate: AWS_CONFIG.DEFAULTS.POWERTOOLS_SAMPLE_RATE_DEV,
    memorySize: 512,
  },
} as const;

/**
 * Get PowerTools layer ARN for the specified region
 */
export function getPowertoolsLayerArn(region: string): string {
  const layerArn = AWS_CONFIG.POWERTOOLS_LAYER_ARNS[region];
  if (!layerArn) {
    throw new Error(`PowerTools layer ARN not configured for region: ${region}`);
  }
  return layerArn;
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(
  environment: string
): typeof ENVIRONMENT_CONFIG.PRODUCTION | typeof ENVIRONMENT_CONFIG.DEVELOPMENT {
  const env = environment.toLowerCase();
  if (env === 'production' || env === 'prod') {
    return ENVIRONMENT_CONFIG.PRODUCTION;
  }
  return ENVIRONMENT_CONFIG.DEVELOPMENT;
}
