/**
 * Manual mock for AWS Lambda Powertools Metrics
 * Provides consistent mock behavior across all tests
 */

export class Metrics {
  public serviceName?: string;
  public namespace?: string;
  public defaultDimensions?: Record<string, string>;

  // Mock functions for all metrics methods
  public addMetric = jest.fn();
  public addDimension = jest.fn();
  public addDimensions = jest.fn();
  public setDefaultDimensions = jest.fn();
  public publishStoredMetrics = jest.fn();
  public clearMetadata = jest.fn();
  public clearDefaultDimensions = jest.fn();
  public clearDimensions = jest.fn();
  public serializeMetrics = jest.fn();

  constructor(options?: any) {
    this.serviceName = options?.serviceName;
    this.namespace = options?.namespace;
    this.defaultDimensions = options?.defaultDimensions;
  }

  // Static methods
  static logMetrics = jest.fn();
}

// Metric units enum mock - using the correct name from the real package
export enum MetricUnit {
  Seconds = 'Seconds',
  Microseconds = 'Microseconds',
  Milliseconds = 'Milliseconds',
  Bytes = 'Bytes',
  Kilobytes = 'Kilobytes',
  Megabytes = 'Megabytes',
  Gigabytes = 'Gigabytes',
  Terabytes = 'Terabytes',
  Bits = 'Bits',
  Kilobits = 'Kilobits',
  Megabits = 'Megabits',
  Gigabits = 'Gigabits',
  Terabits = 'Terabits',
  Percent = 'Percent',
  Count = 'Count',
  BytesPerSecond = 'Bytes/Second',
  KilobytesPerSecond = 'Kilobytes/Second',
  MegabytesPerSecond = 'Megabytes/Second',
  GigabytesPerSecond = 'Gigabytes/Second',
  TerabytesPerSecond = 'Terabytes/Second',
  BitsPerSecond = 'Bits/Second',
  KilobitsPerSecond = 'Kilobits/Second',
  MegabitsPerSecond = 'Megabits/Second',
  GigabitsPerSecond = 'Gigabits/Second',
  TerabitsPerSecond = 'Terabits/Second',
  CountPerSecond = 'Count/Second',
  None = 'None',
}

// Default export for ES6 imports
export default Metrics;
