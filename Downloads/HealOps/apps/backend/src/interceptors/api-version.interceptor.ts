// ─── API Version Interceptor (EC-50) ────────────────────────────────────────
// Sets X-HealOps-API-Version response header on all responses.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Response } from 'express';

@Injectable()
export class ApiVersionInterceptor implements NestInterceptor {
  private static readonly VERSION = '1.0.0';

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('X-HealOps-API-Version', ApiVersionInterceptor.VERSION);
    return next.handle();
  }
}
