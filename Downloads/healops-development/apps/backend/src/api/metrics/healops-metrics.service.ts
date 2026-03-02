// ─── HealOps Metrics Service ──────────────────────────────────────────────
// Prometheus metrics for the HealOps self-healing pipeline.

import { Injectable } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class HealopsMetricsService {
  private readonly jobsTotal: Counter<string>;
  private readonly attemptsTotal: Counter<string>;
  private readonly qualityGateViolationsTotal: Counter<string>;
  private readonly confidenceScore: Histogram<string>;
  private readonly tokensUsed: Counter<string>;
  private readonly fixLatencySeconds: Histogram<string>;
  private readonly escalationTotal: Counter<string>;
  private readonly dlqJobsTotal: Counter<string>;

  constructor() {
    this.jobsTotal = new Counter({
      name: 'healops_jobs_total',
      help: 'Total HealOps repair jobs',
      labelNames: ['status', 'error_type'],
    });

    this.attemptsTotal = new Counter({
      name: 'healops_attempts_total',
      help: 'Total HealOps repair attempts',
      labelNames: ['outcome', 'error_type'],
    });

    this.qualityGateViolationsTotal = new Counter({
      name: 'healops_quality_gate_violations_total',
      help: 'Total quality gate violations',
      labelNames: ['violation'],
    });

    this.confidenceScore = new Histogram({
      name: 'healops_confidence_score',
      help: 'Distribution of LLM confidence scores',
      labelNames: ['error_type'],
      buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    });

    this.tokensUsed = new Counter({
      name: 'healops_tokens_used',
      help: 'Total tokens used by HealOps',
      labelNames: ['direction'],
    });

    this.fixLatencySeconds = new Histogram({
      name: 'healops_fix_latency_seconds',
      help: 'Time from failure detection to fix completion',
      labelNames: ['error_type'],
      buckets: [10, 30, 60, 120, 300, 600, 1200],
    });

    this.escalationTotal = new Counter({
      name: 'healops_escalation_total',
      help: 'Total HealOps escalations',
      labelNames: ['reason'],
    });

    this.dlqJobsTotal = new Counter({
      name: 'healops_dlq_jobs_total',
      help: 'Total jobs landing in DLQ',
      labelNames: ['queue'],
    });
  }

  incrementJobs(status: string, errorType: string): void {
    this.jobsTotal.labels(status, errorType).inc();
  }

  incrementAttempts(outcome: string, errorType: string): void {
    this.attemptsTotal.labels(outcome, errorType).inc();
  }

  incrementQualityGateViolation(violation: string): void {
    this.qualityGateViolationsTotal.labels(violation).inc();
  }

  observeConfidence(errorType: string, score: number): void {
    this.confidenceScore.labels(errorType).observe(score);
  }

  incrementTokens(direction: 'input' | 'output', count: number): void {
    this.tokensUsed.labels(direction).inc(count);
  }

  observeFixLatency(errorType: string, seconds: number): void {
    this.fixLatencySeconds.labels(errorType).observe(seconds);
  }

  incrementEscalation(reason: string): void {
    this.escalationTotal.labels(reason).inc();
  }

  incrementDlqJobs(queue: string): void {
    this.dlqJobsTotal.labels(queue).inc();
  }
}
