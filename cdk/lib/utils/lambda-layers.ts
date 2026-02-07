/**
 * Shared utilities for Lambda layers.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { getPowertoolsLayerArn } from '../config/constants';

/**
 * Create PowerTools layer for Lambda functions.
 */
export function createPowertoolsLayer(scope: Construct): lambda.ILayerVersion {
  const region = cdk.Stack.of(scope).region;
  return lambda.LayerVersion.fromLayerVersionArn(
    scope,
    'PowertoolsLayer',
    getPowertoolsLayerArn(region)
  );
}
