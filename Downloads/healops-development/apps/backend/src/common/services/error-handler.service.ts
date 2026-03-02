import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@common/dto/api-response';
import { LoggerService } from '@logger/logger.service';

// PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERROR_MAP: Record<string, { status: HttpStatus; message: string }> = {
  '23505': { status: HttpStatus.CONFLICT, message: 'Unique constraint violation' },
  '23503': { status: HttpStatus.BAD_REQUEST, message: 'Foreign key constraint failed' },
  '23502': { status: HttpStatus.BAD_REQUEST, message: 'Not null constraint violation' },
  '23514': { status: HttpStatus.BAD_REQUEST, message: 'Check constraint violation' },
  '23P01': { status: HttpStatus.BAD_REQUEST, message: 'Exclusion constraint violation' },
  '22001': { status: HttpStatus.BAD_REQUEST, message: 'Value too long for column type' },
  '22003': { status: HttpStatus.BAD_REQUEST, message: 'Numeric value out of range' },
  '22007': { status: HttpStatus.BAD_REQUEST, message: 'Invalid datetime format' },
  '22P02': { status: HttpStatus.BAD_REQUEST, message: 'Invalid text representation' },
  '42P01': { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Table or view not found' },
  '42703': { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Column not found' },
  '42601': { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Syntax error in query' },
  '40001': { status: HttpStatus.CONFLICT, message: 'Serialization failure — retry the transaction' },
  '40P01': { status: HttpStatus.CONFLICT, message: 'Deadlock detected — retry the transaction' },
  '08006': { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Database connection failure' },
  '08001': { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Unable to establish database connection' },
  '57014': { status: HttpStatus.REQUEST_TIMEOUT, message: 'Query timeout — statement cancelled' },
};

@Injectable()
export class ErrorHandlerService {
  constructor(private readonly logger: LoggerService) {}

  handleError(error: any, context: string): ApiResponse<null> {
    if (this.isPostgresError(error)) {
      return this.handlePgError(error, context);
    }

    if (error instanceof HttpException) {
      return this.handleHttpException(error, context);
    }

    if (error.name === 'SocialAuthError') {
      return this.handleSocialAuthError(error, context);
    }

    return this.handleUnhandledError(error, context);
  }

  private isPostgresError(error: any): boolean {
    return error && typeof error.code === 'string' && error.code.length === 5 && error.severity;
  }

  private handlePgError(error: any, context: string): ApiResponse<null> {
    const code: string = error.code;
    const mapped = PG_ERROR_MAP[code];

    if (mapped) {
      const detail = error.detail ? ` ${error.detail}` : '';
      const table = error.table ? ` (table: ${error.table})` : '';
      const column = error.column ? ` (column: ${error.column})` : '';
      const message = `${mapped.message}${table}${column}.${detail}`;
      return this.createErrorResponse(mapped.status, message, context, error);
    }

    const message = error.detail || error.message || 'An unexpected database error occurred';
    return this.createErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, message, context, error);
  }

  private handleHttpException(error: HttpException, context: string): ApiResponse<null> {
    const status = error.getStatus();
    const message = error.message;
    this.logger.warn(`${error.name} in ${context}: ${message}`, error.stack);
    return this.createErrorResponse(status, message, context, error);
  }

  private handleSocialAuthError(error: any, context: string): ApiResponse<null> {
    if (error.response) {
      this.logger.error(
        `Social auth API error in ${context}: ${JSON.stringify(error.response.data)}`,
        error.stack
      );
      return this.createErrorResponse(
        HttpStatus.BAD_REQUEST,
        error.message || 'Error occurred during social authentication.',
        context,
        error
      );
    }
    this.logger.error(`Unhandled social auth error in ${context}: ${error.message}`, error.stack);
    return this.createErrorResponse(
      HttpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'An error occurred during social authentication.',
      context,
      error
    );
  }

  private handleUnhandledError(error: any, context: string): ApiResponse<null> {
    this.logger.error(`Unhandled error in ${context}: ${error.message}`, error.stack);
    if (error.message?.includes('Failed to send SMS')) {
      return this.createErrorResponse(
        HttpStatus.FORBIDDEN,
        'SMS service is restricted for trial accounts. Please verify the recipient number or upgrade your Twilio account.',
        context,
        error
      );
    }
    return this.createErrorResponse(
      HttpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'An unknown error occurred. Please try again later.',
      context,
      error
    );
  }

  private createErrorResponse(
    statusCode: HttpStatus,
    message: string,
    _context: string,
    _error: any,
    data?: any
  ): ApiResponse<any> {
    return {
      statusCode,
      status: 'Failure',
      message: typeof message === 'string' ? message : JSON.stringify(message) || 'Error Occured',
      error: this.formatErrorString(HttpStatus[statusCode]),
      data: data || null,
    };
  }

  private formatErrorString(error: string): string {
    return error
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  handleAuthError(error: any, context: string): ApiResponse<null> {
    if (error.response && error.response.status === 401) {
      return this.createErrorResponse(
        HttpStatus.UNAUTHORIZED,
        error.message || 'Unauthorized access.',
        context,
        error
      );
    }
    if (error.response && error.response.status === 403) {
      return this.createErrorResponse(
        HttpStatus.FORBIDDEN,
        error.message || 'Access denied.',
        context,
        error
      );
    }
    return this.createErrorResponse(
      HttpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'An unknown authentication error occurred.',
      context,
      error
    );
  }

  handleBadRequest(error: any, context: string): ApiResponse<null> {
    if (error.response?.message && Array.isArray(error.response.message)) {
      const cleanedMessages = error.response.message.map((msg: string) => {
        return msg.replace(/^[a-zA-Z0-9_.]+?\./, '');
      });
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        status: 'Failure',
        message: cleanedMessages.join(', '),
        error: 'Validation Error',
      };
    }
    return this.createErrorResponse(
      HttpStatus.BAD_REQUEST,
      error.message || error.response?.message || 'Bad request.',
      context,
      error,
      error.response?.data || null
    );
  }

  handleUnauthorized(error: any, context: string): ApiResponse<null> {
    return this.createErrorResponse(
      HttpStatus.UNAUTHORIZED,
      error.message || 'Unauthorized.',
      context,
      error
    );
  }

  handleForbidden(error: any, context: string): ApiResponse<null> {
    if (error.message?.includes('authorization grant is invalid')) {
      return this.createErrorResponse(
        HttpStatus.FORBIDDEN,
        'Email service is temporarily unavailable. We are working on a fix.',
        context,
        error
      );
    }
    return this.createErrorResponse(
      HttpStatus.FORBIDDEN,
      error.message || 'Forbidden.',
      context,
      error
    );
  }

  handleNotFound(error: any, context: string): ApiResponse<null> {
    return this.createErrorResponse(
      HttpStatus.NOT_FOUND,
      error.message || 'Not found.',
      context,
      error
    );
  }

  handleInternalServerError(error: any, context: string): ApiResponse<null> {
    return this.createErrorResponse(
      HttpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Internal server error.',
      context,
      error
    );
  }
}
