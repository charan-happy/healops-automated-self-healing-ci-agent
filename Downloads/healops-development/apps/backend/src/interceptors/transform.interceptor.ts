import { ApiResponse } from '@common/dto/api-response';
import { RouteNames } from '@common/route-names';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    // Check if the request is an HTTP request
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest();

      // Exclude infrastructure routes (Prometheus /metrics, /health) — NOT healops dashboard/metrics
      const path: string = request.url;
      if (
        (path === `/${RouteNames.METRICS}` || path.startsWith(`/${RouteNames.METRICS}?`)) ||
        (path === `/${RouteNames.HEALTH}` || path.startsWith(`/${RouteNames.HEALTH}?`) || path.startsWith(`/${RouteNames.HEALTH}/`))
      ) {
        return next.handle();
      }

      return next.handle().pipe(
        map(data => {
          const response = context.switchToHttp().getResponse();
          return {
            statusCode: data?.statusCode || response?.statusCode || 200,
            status: data?.status || 'Success',
            message: data?.message || 'Request successful',
            data: data?.data || data,
            error: data?.error || null,
          };
        })
      );
    }

    if (context.getType().toString() === 'graphql') {
      return next.handle().pipe(
        map(data => ({
          statusCode: 200,
          status: 'Success',
          message: 'Request successful',
          data: data,
          error: '',
        }))
      );
    }

    return next.handle(); // For other contexts, pass through without modification
  }
}
