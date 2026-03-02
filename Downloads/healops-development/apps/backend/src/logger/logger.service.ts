import { getTraceContext } from '@common/helpers/trace-context.util';
import { EnvConfig } from '@config/env.config';
import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import CircuitBreaker from 'opossum';
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  private static sigtermListenerAdded = false; // Static flag to track if the listener has been added
  private logger: WinstonLogger;
  private lokiPort: number = 3100;
  private logQueue: any[] = [];
  private flushInterval = 5000; // 5 seconds
  private breaker!: CircuitBreaker;
  private circuitOptions = {
    timeout: 5000, // If the function takes longer than 5 seconds, it will timeout
    errorThresholdPercentage: 50, // If 50% of requests fail, the breaker will open
    resetTimeout: 10000, // After 10 seconds, try again
  };

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    // Enable logging only in non-production environments
    const environment = this.configService.get<string>('NODE_ENV');
    const lokiAPI = this.configService.get<string>('LOKI_API_TOKEN');
    const lokiPORT = this.configService.get<string>('LOKI_PORT');
    this.lokiPort = parseInt(lokiPORT || '3100', 10);
    const isProduction = environment === 'production';
    const isStaging = environment === 'staging';
    const isDevelopment = environment === 'development';

    // Create Winston logger with configuration
    this.logger = createLogger({
      level: isProduction ? 'warn' : 'debug',
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message, context }) => {
          return `${timestamp} [${level}] [${context || 'App'}]: ${message}`;
        })
      ),
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.printf(({ timestamp, level, message, context }) => {
              return `${timestamp} [${level}] [${context || 'App'}]: ${message}`;
            })
          ),
        }),
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: isProduction ? '15d' : isStaging ? '7d' : '3d',
        }),
      ],
    });

    if (isDevelopment) {
      // Start the log flusher
      this.startLogFlusher(lokiAPI || '');

      this.logger.on('data', (log) => {
        this.addToLogQueue(log);
      });

      // Add SIGTERM listener only once (Handle graceful shutdown)
      if (!LoggerService.sigtermListenerAdded) {
        process.on('SIGTERM', async () => {
          await this.sendBatchToPromtail(lokiAPI || ''); // Flush any remaining logs
          process.exit(0);
        });
        LoggerService.sigtermListenerAdded = true; // Mark the listener as added
      }

      // Create the circuit breaker to wrap the sendBatchToPromtail method
      this.breaker = new CircuitBreaker(this.sendBatchToPromtail.bind(this), this.circuitOptions);
      this.breaker.on('open', () => Logger.warn('Circuit breaker opened for sendBatchToPromtail'));
      this.breaker.on('halfOpen', () => Logger.log('Circuit breaker is half-open, trying to send logs again'));
      this.breaker.on('close', () => Logger.log('Circuit breaker closed, normal operation resumed'));
    } else {
      Logger.log(`🚀 Loki logging is disabled in ${environment} mode`);
    }
  }

  private formatTracePrefix(traceId?: string, spanId?: string): string {
    let { traceId: traceId_, spanId: spanId_ } = getTraceContext();
    traceId = traceId || traceId_;
    spanId = spanId || spanId_;
    if (!traceId) return '';
    return `[TraceId=${traceId}${spanId ? ` | SpanId=${spanId}` : ''}] `;
  }

  private addToLogQueue(log: any) {
    this.logQueue.push(log);
  }

  private startLogFlusher(lokiAPI: string) {
    setInterval(() => {
      if (this.logQueue.length > 0) {
        this.breaker.fire(lokiAPI).catch((error) => {
          Logger.error('Circuit breaker prevented sending logs:', error.message);
        });
      }
    }, this.flushInterval);
  }

  private async sendBatchToPromtail(lokiAPI: string) {
    const logsToSend = [...this.logQueue];
    try {
      this.logQueue = []; // Clear the queue after copying

      const response = await fetch(`http://127.0.0.1:${this.lokiPort}/loki/api/v1/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lokiAPI}`,
        },
        body: JSON.stringify({
          streams: [
            {
              stream: { service: 'backend' },
              values: logsToSend.map((log) => [`${Date.now() * 1e6}`, log.message]),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      Logger.error('Failed to send batch logs to Promtail:', (error as Error).message);
      // Optionally, re-add logs to queue if sending failed
      this.logQueue.push(...logsToSend);
      throw error; // Throw error to let the circuit breaker handle it
    }
  }

  // Custom error log
  error(message: string, trace?: string, context?: string, traceId?: string, spanId?: string) {
    const prefix = this.formatTracePrefix(traceId, spanId);
    this.logger.error({ message: `${prefix}${message}`, trace, context });
  }

  // Custom warning log
  warn(message: string, context?: string, traceId?: string, spanId?: string) {
    const prefix = this.formatTracePrefix(traceId, spanId);
    this.logger.warn({ message: `${prefix}${message}`, context });
  }

  // Custom general log
  log(message: string, context?: string, traceId?: string, spanId?: string) {
    const prefix = this.formatTracePrefix(traceId, spanId);
    this.logger.info({ message: `${prefix}${message}`, context });
  }

  // Additional debug log method
  debug(message: string, context?: string, traceId?: string, spanId?: string) {
    const prefix = this.formatTracePrefix(traceId, spanId);
    this.logger.debug({ message: `${prefix}${message}`, context });
  }

  // HTTP request/response logging method
  http(message: string, context?: string, traceId?: string, spanId?: string) {
    const prefix = this.formatTracePrefix(traceId, spanId);
    this.logger.info({ message: `${prefix}${message}`, context: context || 'HTTP' });
  }
}
