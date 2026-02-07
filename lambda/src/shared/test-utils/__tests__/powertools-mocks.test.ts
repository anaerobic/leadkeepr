import { createMockLogger, createMockMetrics, createMockPowertools } from '../powertools-mocks';

describe('Powertools Mocks', () => {
  describe('createMockLogger', () => {
    it('should create a properly typed mock Logger', () => {
      const mockLogger = createMockLogger();

      expect(mockLogger).toBeDefined();
      expect(mockLogger.info).toBeDefined();
      expect(mockLogger.error).toBeDefined();
      expect(mockLogger.warn).toBeDefined();
      expect(mockLogger.debug).toBeDefined();
    });

    it('should create independent mock instances', () => {
      const mockLogger1 = createMockLogger();
      const mockLogger2 = createMockLogger();

      expect(mockLogger1).not.toBe(mockLogger2);
    });
  });

  describe('createMockMetrics', () => {
    it('should create a properly typed mock Metrics', () => {
      const mockMetrics = createMockMetrics();

      expect(mockMetrics).toBeDefined();
      expect(mockMetrics.addMetric).toBeDefined();
      expect(mockMetrics.publishStoredMetrics).toBeDefined();
    });

    it('should create independent mock instances', () => {
      const mockMetrics1 = createMockMetrics();
      const mockMetrics2 = createMockMetrics();

      expect(mockMetrics1).not.toBe(mockMetrics2);
    });
  });

  describe('createMockPowertools', () => {
    it('should create both logger and metrics mocks', () => {
      const { mockLogger, mockMetrics } = createMockPowertools();

      expect(mockLogger).toBeDefined();
      expect(mockMetrics).toBeDefined();
    });

    it('should create independent instances each time', () => {
      const powertools1 = createMockPowertools();
      const powertools2 = createMockPowertools();

      expect(powertools1.mockLogger).not.toBe(powertools2.mockLogger);
      expect(powertools1.mockMetrics).not.toBe(powertools2.mockMetrics);
    });
  });
});
