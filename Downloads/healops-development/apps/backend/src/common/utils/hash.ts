// ─── Hash Utilities ─────────────────────────────────────────────────────────
// Hashing functions for error deduplication, circular fix detection,
// and vector memory deduplication.

import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Normalise error text by stripping volatile parts (line numbers, timestamps,
 * SHAs, file paths, UUIDs) before hashing for deduplication.
 * Structurally identical errors produce the same normalised output.
 */
export function normaliseErrorText(text: string): string {
  return text
    // Strip absolute file paths (keep only the filename)
    .replace(/(?:\/[\w.-]+)+\/([\w.-]+)/g, '$1')
    // Strip Windows paths
    .replace(/(?:[A-Z]:\\[\w.-\\]+\\)([\w.-]+)/gi, '$1')
    // Strip line:column numbers like :14:3 or (14,3)
    .replace(/:\d+:\d+/g, ':X:X')
    .replace(/\(\d+,\s*\d+\)/g, '(X,X)')
    // Strip standalone line numbers like "line 14"
    .replace(/line\s+\d+/gi, 'line X')
    // Strip timestamps (ISO 8601)
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\dZ]*/g, 'TIMESTAMP')
    // Strip commit SHAs (7-40 hex chars that look like SHAs)
    .replace(/\b[0-9a-f]{7,40}\b/g, 'SHA')
    // Strip UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * SHA-256 hash of normalised error text.
 * Used for: failures.error_hash, flaky_failure_registry deduplication.
 */
export function hashError(errorText: string): string {
  const normalised = normaliseErrorText(errorText);
  return createHash('sha256').update(normalised).digest('hex');
}

/**
 * SHA-256 hash of normalised diff content.
 * Used for: attempts.fix_fingerprint (circular fix detection).
 */
export function hashDiff(diffContent: string): string {
  const normalised = diffContent
    .replace(/index [a-f0-9]+\.\.[a-f0-9]+/g, '') // git index lines
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(normalised).digest('hex');
}

/**
 * SHA-256 hash for vector memory deduplication.
 * Combines error context + language + failure type to prevent duplicate embeddings.
 */
export function hashContext(
  errorText: string,
  language: string,
  failureType: string,
): string {
  const combined = `${normaliseErrorText(errorText)}|${language}|${failureType}`;
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * SHA-256 hash of normalised error text, optionally scoped by error type.
 * Used by the AI Fix pipeline for deduplication.
 */
export function generateErrorHash(
  errorMessage: string,
  errorType?: string,
): string {
  const normalised = normaliseErrorText(errorMessage);
  const input = errorType ? `${errorType}:${normalised}` : normalised;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Context hash combining error message + code snippet + language.
 * More specific than hashContext — includes a snippet fingerprint.
 * Used by the AI Fix pipeline for vector memory deduplication.
 */
export function generateContextHash(
  errorMessage: string,
  codeSnippet: string,
  language: string,
): string {
  const normalised = normaliseErrorText(errorMessage);
  const snippetHash = createHash('sha256')
    .update(codeSnippet.trim())
    .digest('hex')
    .slice(0, 16);
  const input = `${normalised}:${snippetHash}:${language}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * HMAC-SHA256 for webhook signature verification.
 */
export function computeHmacSha256(
  payload: string,
  secret: string,
): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

/**
 * Timing-safe comparison of HMAC signatures to prevent timing attacks.
 */
export function verifySignature(
  computed: string,
  received: string,
): boolean {
  try {
    const computedBuf = Buffer.from(computed, 'utf8');
    const receivedBuf = Buffer.from(received, 'utf8');
    if (computedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(computedBuf, receivedBuf);
  } catch {
    return false;
  }
}
