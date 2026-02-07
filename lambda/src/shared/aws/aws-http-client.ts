/**
 * AWS Service HTTP Request Utility
 *
 * Provides utilities for making direct HTTP requests to AWS services
 * when the TypeScript SDK is not available (like S3 Vectors preview).
 */

import { AwsWrapperConfig } from './wrapper-base';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

/**
 * AWS service endpoint configuration
 */
export interface AwsServiceEndpoint {
  service: string;
  region: string;
  hostname?: string;
}

/**
 * HTTP request configuration for AWS services
 */
export interface AwsHttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: string | Buffer;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
}

/**
 * AWS HTTP response
 */
export interface AwsHttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Create AWS service HTTP request utility
 */
export function createAwsHttpClient(endpoint: AwsServiceEndpoint, wrapperConfig: AwsWrapperConfig) {
  const { service, region, hostname } = endpoint;
  const host = hostname || `${service}.${region}.amazonaws.com`;

  /**
   * Make authenticated HTTP request to AWS service
   */
  async function makeRequest(requestConfig: AwsHttpRequestConfig): Promise<AwsHttpResponse> {
    const { method, path, body, headers = {}, queryParams = {} } = requestConfig;

    try {
      // Get AWS credentials
      const credentials = await defaultProvider()();

      // Build URL with query parameters
      const queryString =
        Object.keys(queryParams).length > 0
          ? '?' + new URLSearchParams(queryParams).toString()
          : '';

      // Prepare headers
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Host: host,
        ...headers,
      };

      if (body) {
        requestHeaders['Content-Length'] = Buffer.byteLength(body, 'utf8').toString();
      }

      // Create HTTP request for AWS signing
      const request = new HttpRequest({
        method,
        protocol: 'https:',
        hostname: host,
        path: path + queryString,
        headers: requestHeaders,
        body: body,
      });

      // Sign the request using AWS Signature V4
      const signer = new SignatureV4({
        credentials,
        region,
        service,
        sha256: Sha256,
      });

      const signedRequest = await signer.sign(request);

      wrapperConfig.logger.debug('Making AWS HTTP request', {
        service,
        method,
        url: `https://${host}${path}${queryString}`.replace(/\?.+/, '?[params]'), // Hide query params in logs
        hasBody: !!body,
        bodyLength: body ? Buffer.byteLength(body, 'utf8') : 0,
      });

      // Make HTTP request using Node.js built-in https module
      const https = await import('https');

      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: signedRequest.hostname,
            port: 443,
            path: signedRequest.path,
            method: signedRequest.method,
            headers: signedRequest.headers,
          },
          (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
              responseBody += chunk;
            });

            res.on('end', () => {
              const response: AwsHttpResponse = {
                statusCode: res.statusCode || 0,
                headers: res.headers as Record<string, string>,
                body: responseBody,
              };

              wrapperConfig.logger.debug('AWS HTTP response received', {
                service,
                statusCode: response.statusCode,
                bodyLength: responseBody.length,
                success: response.statusCode >= 200 && response.statusCode < 300,
              });

              resolve(response);
            });
          }
        );

        req.on('error', (error) => {
          wrapperConfig.logger.error('AWS HTTP request failed', {
            service,
            method,
            error: error.message,
            host,
            path,
          });
          reject(error);
        });

        // Write request body if present
        if (body) {
          req.write(body);
        }

        req.end();
      });
    } catch (error) {
      wrapperConfig.logger.error('Failed to create AWS HTTP request', {
        service,
        method,
        path,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Helper for JSON API requests
   */
  async function makeJsonRequest(
    requestConfig: Omit<AwsHttpRequestConfig, 'headers'> & {
      data?: any;
      headers?: Record<string, string>;
    }
  ): Promise<any> {
    const { data, headers = {}, ...config } = requestConfig;

    const response = await makeRequest({
      ...config,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    // Check for HTTP errors
    if (response.statusCode < 200 || response.statusCode >= 300) {
      const errorMessage = `HTTP ${response.statusCode}: ${response.body}`;
      throw new Error(errorMessage);
    }

    // Parse JSON response
    try {
      return response.body ? JSON.parse(response.body) : {};
    } catch (parseError) {
      wrapperConfig.logger.warn('Failed to parse JSON response', {
        statusCode: response.statusCode,
        body: response.body.substring(0, 1000), // Limit logged body size
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return { rawBody: response.body };
    }
  }

  return {
    makeRequest,
    makeJsonRequest,
    endpoint: { service, region, host },
  };
}

/**
 * Create S3 Vectors HTTP client
 */
export function createS3VectorsHttpClient(region: string, config: AwsWrapperConfig) {
  return createAwsHttpClient(
    {
      service: 's3vectors',
      region,
      // S3 Vectors uses the .api.aws hostname pattern (not .amazonaws.com)
      hostname: `s3vectors.${region}.api.aws`,
    },
    config
  );
}
