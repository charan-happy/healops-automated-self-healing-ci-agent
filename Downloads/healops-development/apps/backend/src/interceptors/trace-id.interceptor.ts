import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
  intercept(context_: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    const traceId = span?.spanContext().traceId;
    const spanId = span?.spanContext().spanId;
    const response = context_.switchToHttp().getResponse();
    if (traceId) response.setHeader('x-trace-id', traceId);
    if (spanId) response.setHeader('x-span-id', spanId);

    return next.handle().pipe(
      tap(() => {
        // No-op: headers already set
      }),
      catchError((err) => {
        if (traceId) response.setHeader('x-trace-id', traceId);
        if (spanId) response.setHeader('x-span-id', spanId);
        throw err;
      })
    );
  }
}
