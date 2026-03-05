import { Injectable, Logger } from '@nestjs/common';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface CircuitState {
  status: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const FAILURE_THRESHOLD = 3;
const RECOVERY_TIMEOUT_MS = 60_000;

/**
 * In-memory circuit breaker for AI providers.
 *
 * Tracks per-provider failure counts and transitions through
 * CLOSED → OPEN → HALF_OPEN → CLOSED states.
 *
 * - CLOSED: requests flow through normally.
 * - OPEN: provider is unavailable; requests are rejected until recovery timeout.
 * - HALF_OPEN: one probe request is allowed through to test recovery.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitState>();

  /**
   * Check whether the given provider is currently available.
   *
   * - CLOSED / HALF_OPEN → available (true)
   * - OPEN but past recovery timeout → transitions to HALF_OPEN, returns true
   * - OPEN and within recovery window → unavailable (false)
   */
  isAvailable(providerName: string): boolean {
    const state = this.circuits.get(providerName);

    // No recorded state means the circuit has never tripped.
    if (!state) {
      return true;
    }

    if (state.status === 'closed' || state.status === 'half_open') {
      return true;
    }

    // status === 'open'
    const elapsed = Date.now() - state.lastFailureTime;
    if (elapsed >= RECOVERY_TIMEOUT_MS) {
      state.status = 'half_open';
      this.logger.log(
        `Circuit for "${providerName}" transitioned OPEN → HALF_OPEN after ` +
          String(elapsed) + 'ms',
      );
      return true;
    }

    return false;
  }

  /**
   * Record a successful call — resets the circuit to CLOSED.
   */
  recordSuccess(providerName: string): void {
    const now = Date.now();
    const state = this.circuits.get(providerName);

    if (state) {
      const previous = state.status;
      state.status = 'closed';
      state.failureCount = 0;
      state.lastSuccessTime = now;

      if (previous !== 'closed') {
        this.logger.log(
          `Circuit for "${providerName}" reset to CLOSED (was ${previous})`,
        );
      }
    } else {
      this.circuits.set(providerName, {
        status: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: now,
      });
    }
  }

  /**
   * Record a failed call — increments failure count and transitions to
   * OPEN once the threshold is reached.
   */
  recordFailure(providerName: string): void {
    const now = Date.now();
    const state = this.circuits.get(providerName);

    if (state) {
      state.failureCount += 1;
      state.lastFailureTime = now;

      if (state.failureCount >= FAILURE_THRESHOLD) {
        state.status = 'open';
        this.logger.warn(
          `Circuit for "${providerName}" tripped to OPEN after ` +
            String(state.failureCount) + ' consecutive failures',
        );
      }
    } else {
      const newState: CircuitState = {
        status: 'closed',
        failureCount: 1,
        lastFailureTime: now,
        lastSuccessTime: 0,
      };

      if (newState.failureCount >= FAILURE_THRESHOLD) {
        newState.status = 'open';
      }

      this.circuits.set(providerName, newState);
    }
  }
}
