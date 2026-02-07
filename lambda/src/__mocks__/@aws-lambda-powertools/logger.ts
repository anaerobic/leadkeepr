/**
 * Manual mock for AWS Lambda Powertools Logger
 * Provides consistent mock behavior across all tests
 */

export class Logger {
  public serviceName?: string;
  public logLevel?: string;
  public sampleRateValue?: number;

  // Mock functions for all logger methods
  public info = jest.fn();
  public warn = jest.fn();
  public error = jest.fn();
  public debug = jest.fn();
  public trace = jest.fn();
  public child = jest.fn(() => new Logger());
  public addContext = jest.fn();
  public removeKeys = jest.fn();
  public setPersistentLogAttributes = jest.fn();
  public setLogLevel = jest.fn();

  constructor(options?: any) {
    this.serviceName = options?.serviceName;
    this.logLevel = options?.logLevel;
    this.sampleRateValue = options?.sampleRateValue;
  }

  // Static methods
  static injectLambdaContext = jest.fn();
}

// Default export for ES6 imports
export default Logger;
