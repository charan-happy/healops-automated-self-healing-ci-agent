import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'audit_log';

export interface AuditLogDecoratorOptions {
  operationType: 'VIEW' | 'INSERT' | 'UPDATE' | 'DELETE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
}

/**
 * Marks a route handler for automatic audit logging.
 * The AuditInterceptor reads this metadata and writes an audit record
 * after the response completes successfully.
 *
 * @example
 * @AuditLog({ operationType: 'INSERT', severity: 'MEDIUM', description: 'Created a new user' })
 */
export const AuditLog = (options: AuditLogDecoratorOptions) =>
  SetMetadata(AUDIT_LOG_KEY, options);
