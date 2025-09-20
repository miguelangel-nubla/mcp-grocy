/**
 * Centralized logging utility with configurable levels and structured output
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  category?: string | undefined;
  data?: any;
  timestamp: Date;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private enabledCategories: Set<string> | null = null;

  private constructor() {
    // Default to INFO level, but allow override via environment
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL || 'INFO');
    
    // Allow filtering by categories
    const categories = process.env.LOG_CATEGORIES;
    if (categories) {
      this.enabledCategories = new Set(categories.split(',').map(c => c.trim().toUpperCase()));
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private parseLogLevel(level: string): LogLevel {
    const upperLevel = level.toUpperCase();
    switch (upperLevel) {
      case 'ERROR': return LogLevel.ERROR;
      case 'WARN': return LogLevel.WARN;
      case 'INFO': return LogLevel.INFO;
      case 'DEBUG': return LogLevel.DEBUG;
      case 'TRACE': return LogLevel.TRACE;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel, category?: string): boolean {
    // Check log level
    if (level > this.logLevel) {
      return false;
    }

    // Check category filter
    if (this.enabledCategories && category) {
      return this.enabledCategories.has(category.toUpperCase());
    }

    return true;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevel[entry.level].padEnd(5);
    const category = entry.category ? `[${entry.category}]` : '';
    const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    
    return `${timestamp} ${level} ${category} ${entry.message}${data}`;
  }

  private log(level: LogLevel, message: string, category?: string, data?: any): void {
    if (!this.shouldLog(level, category)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      category: category || undefined,
      data,
      timestamp: new Date()
    };

    const formattedMessage = this.formatMessage(entry);

    // Use stderr for all logs to avoid interfering with MCP stdio protocol
    if (level <= LogLevel.ERROR) {
      console.error(formattedMessage);
    } else {
      console.error(formattedMessage);
    }
  }

  public error(message: string, category?: string, data?: any): void {
    this.log(LogLevel.ERROR, message, category, data);
  }

  public warn(message: string, category?: string, data?: any): void {
    this.log(LogLevel.WARN, message, category, data);
  }

  public info(message: string, category?: string, data?: any): void {
    this.log(LogLevel.INFO, message, category, data);
  }

  public debug(message: string, category?: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, category, data);
  }

  public trace(message: string, category?: string, data?: any): void {
    this.log(LogLevel.TRACE, message, category, data);
  }

  // Convenience methods for common categories
  public config(message: string, data?: any): void {
    this.info(message, 'CONFIG', data);
  }

  public api(message: string, data?: any): void {
    this.debug(message, 'API', data);
  }

  public module(message: string, data?: any): void {
    this.debug(message, 'MODULE', data);
  }

  public tools(message: string, data?: any): void {
    this.info(message, 'TOOLS', data);
  }

  public server(message: string, data?: any): void {
    this.info(message, 'SERVER', data);
  }

  // Testing utilities
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public setEnabledCategories(categories: string[] | null): void {
    this.enabledCategories = categories ? new Set(categories.map(c => c.toUpperCase())) : null;
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Convenience function for quick logging
export function log(level: LogLevel, message: string, category?: string, data?: any): void {
  // Access the private log method through the public methods
  switch (level) {
    case LogLevel.ERROR:
      logger.error(message, category, data);
      break;
    case LogLevel.WARN:
      logger.warn(message, category, data);
      break;
    case LogLevel.INFO:
      logger.info(message, category, data);
      break;
    case LogLevel.DEBUG:
      logger.debug(message, category, data);
      break;
    case LogLevel.TRACE:
      logger.trace(message, category, data);
      break;
  }
}