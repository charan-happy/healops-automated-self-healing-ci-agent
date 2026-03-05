import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TracingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    try {
      const request = context.switchToHttp().getRequest();
      const response = context.switchToHttp().getResponse();
      const method = request?.method || 'UNKNOWN';
      const url = request?.url || '/unknown';
      const userAgent = request?.get?.('User-Agent') || 'unknown';

      // Get the current tracer
      const tracer = trace.getTracer('nestjs-http', '1.0.0');

      // Start a new span for this request
      const span = tracer.startSpan(`${method} ${url}`, {
        attributes: {
          'http.method': method,
          'http.url': url,
          'http.user_agent': userAgent,
          'http.route': url,
          'service.name': 'nestjs-app',
          'service.version': '1.0.0',
          'service.instance.id': process.env['HOSTNAME'] || 'localhost',
        },
      });

      // Add request ID to span if available
      if (request?.headers?.['x-request-id']) {
        span.setAttributes({
          'http.request_id': request.headers['x-request-id'],
        });
      }

      const startTime = Date.now();

      return next.handle().pipe(
        tap({
          next: data => {
            const duration = Date.now() - startTime;

            // Safely calculate response size
            let responseSize = 0;
            if (data !== undefined && data !== null) {
              try {
                responseSize = JSON.stringify(data).length;
              } catch (error) {
                // If data can't be stringified, try to get length of string representation
                responseSize = String(data).length;
              }
            }

            span.setAttributes({
              'http.status_code': response.statusCode,
              'http.response_time_ms': duration,
              'response.size': responseSize,
            });

            span.setStatus({ code: SpanStatusCode.OK });
            span.end();

            this.logger.debug(`✅ ${method} ${url} - ${response.statusCode} (${duration}ms)`);
          },
          error: error => {
            const duration = Date.now() - startTime;
            const statusCode = error?.status || error?.statusCode || 500;
            const errorMessage = error?.message || 'Unknown error';
            const errorName = error?.name || 'Error';

            span.setAttributes({
              'http.status_code': statusCode,
              'http.response_time_ms': duration,
              'error.message': errorMessage,
              'error.name': errorName,
            });

            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: errorMessage,
            });
            span.end();

            this.logger.error(
              `❌ ${method} ${url} - ${statusCode} (${duration}ms) - ${errorMessage}`
            );
          },
        })
      );
    } catch (error) {
      this.logger.error('Failed to initialize tracing interceptor:', error);
      // If tracing fails, just return the original observable without tracing
      return next.handle();
    }
  }
}
