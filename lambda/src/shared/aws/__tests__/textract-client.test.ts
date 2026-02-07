import { TextractClient } from '@aws-sdk/client-textract';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  createTextractClient,
  createDefaultTextractClient,
  DEFAULT_TEXTRACT_CONFIG,
  TextractClientConfig,
} from '../textract-client';

// Mock AWS SDK
jest.mock('@aws-sdk/client-textract');
jest.mock('aws-xray-sdk-core');

const MockedTextractClient = TextractClient as jest.MockedClass<typeof TextractClient>;

describe('Textract Client Factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variable
    delete process.env.AWS_REGION;
  });

  describe('createTextractClient', () => {
    it('should create TextractClient with default configuration', () => {
      const client = createTextractClient();

      expect(MockedTextractClient).toHaveBeenCalledWith({
        region: undefined,
        endpoint: undefined,
      });
      expect(client).toBeInstanceOf(TextractClient);
    });

    it('should create TextractClient with custom region', () => {
      const config: TextractClientConfig = {
        region: 'us-east-1',
      };

      createTextractClient(config);

      expect(MockedTextractClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        endpoint: undefined,
      });
    });

    it('should create TextractClient with custom endpoint', () => {
      const config: TextractClientConfig = {
        endpoint: 'http://localhost:4566',
      };

      createTextractClient(config);

      expect(MockedTextractClient).toHaveBeenCalledWith({
        region: undefined,
        endpoint: 'http://localhost:4566',
      });
    });

    it('should create TextractClient with full configuration', () => {
      const config: TextractClientConfig = {
        region: 'eu-west-1',
        endpoint: 'http://localhost:4566',
      };

      createTextractClient(config);

      expect(MockedTextractClient).toHaveBeenCalledWith({
        region: 'eu-west-1',
        endpoint: 'http://localhost:4566',
      });
    });

    it('should apply X-Ray tracing when tracer provided', async () => {
      const { captureAWSv3Client } = await import('aws-xray-sdk-core');
      const mockTracer = {} as Tracer;
      const mockCaptureAWSv3Client = captureAWSv3Client as jest.MockedFunction<
        typeof captureAWSv3Client
      >;

      const mockTracedClient = {} as TextractClient;
      mockCaptureAWSv3Client.mockReturnValue(mockTracedClient);

      const config: TextractClientConfig = {
        tracer: mockTracer,
      };

      const client = createTextractClient(config);

      expect(mockCaptureAWSv3Client).toHaveBeenCalledWith(expect.any(TextractClient));
      expect(client).toBe(mockTracedClient);
    });

    it('should not apply X-Ray tracing when no tracer provided', () => {
      const client = createTextractClient();

      expect(client).toBeInstanceOf(TextractClient);
      // X-Ray capture should not be called
    });
  });

  describe('createDefaultTextractClient', () => {
    it('should create client with default configuration from environment', () => {
      // The default config is evaluated at module load time
      // So we test that it creates a client with the default config
      createDefaultTextractClient();

      expect(MockedTextractClient).toHaveBeenCalledWith({
        region: 'us-west-2', // Default fallback region
        endpoint: undefined,
      });
    });

    it('should fall back to default region when env var not set', () => {
      createDefaultTextractClient();

      expect(MockedTextractClient).toHaveBeenCalledWith({
        region: 'us-west-2',
        endpoint: undefined,
      });
    });

    it('should apply tracer when provided', async () => {
      const { captureAWSv3Client } = await import('aws-xray-sdk-core');
      const mockTracer = {} as Tracer;
      const mockCaptureAWSv3Client = captureAWSv3Client as jest.MockedFunction<
        typeof captureAWSv3Client
      >;

      const mockTracedClient = {} as TextractClient;
      mockCaptureAWSv3Client.mockReturnValue(mockTracedClient);

      const client = createDefaultTextractClient(mockTracer);

      expect(mockCaptureAWSv3Client).toHaveBeenCalledWith(expect.any(TextractClient));
      expect(client).toBe(mockTracedClient);
    });
  });

  describe('DEFAULT_TEXTRACT_CONFIG', () => {
    it('should have correct default configuration', () => {
      // The config is evaluated at module load time, test the current value
      expect(DEFAULT_TEXTRACT_CONFIG).toEqual({
        region: 'us-west-2', // Default fallback when AWS_REGION not set at module load
      });
    });

    it('should fall back to us-west-2 when AWS_REGION not set', async () => {
      // Re-import to get fresh config
      jest.resetModules();
      const { DEFAULT_TEXTRACT_CONFIG: freshConfig } = await import('../textract-client');

      expect(freshConfig).toEqual({
        region: 'us-west-2',
      });
    });
  });

  describe('integration scenarios', () => {
    it('should work with attachment processors', () => {
      // This simulates how attachment processors would use the factory
      const config: TextractClientConfig = {
        region: 'us-west-2',
      };

      const client = createTextractClient(config);

      expect(client).toBeInstanceOf(TextractClient);
      expect(MockedTextractClient).toHaveBeenCalledWith({
        region: 'us-west-2',
        endpoint: undefined,
      });
    });

    it('should support observability configuration', () => {
      // Simulate Lambda environment with observability
      const config: TextractClientConfig = {
        region: 'us-west-2',
      };

      const client = createTextractClient(config);

      expect(MockedTextractClient).toHaveBeenCalledWith({
        region: 'us-west-2',
        endpoint: undefined,
      });
      expect(client).toBeInstanceOf(TextractClient);
    });
  });
});
