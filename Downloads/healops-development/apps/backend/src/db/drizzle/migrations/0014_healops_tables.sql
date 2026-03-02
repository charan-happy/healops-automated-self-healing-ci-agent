-- ─── HealOps Tables Migration ──────────────────────────────────────────────
-- 21 tables across 7 architectural tiers
-- pgvector extension + HNSW index for vector similarity search

-- ─── Prerequisites ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 1: Platform Foundation
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  slack_webhook_url VARCHAR(500),
  monthly_job_limit INTEGER DEFAULT 100,
  monthly_token_budget INTEGER DEFAULT 1000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  provider VARCHAR(50) NOT NULL,
  external_repo_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  default_branch VARCHAR(100) NOT NULL DEFAULT 'main',
  primary_language VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  webhook_secret VARCHAR(500),
  github_installation_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_provider_external_repo_id
  ON repositories (provider, external_repo_id);

CREATE TABLE IF NOT EXISTS repository_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) UNIQUE,
  slack_channel VARCHAR(100),
  slack_webhook_url VARCHAR(500),
  max_jobs_per_day INTEGER NOT NULL DEFAULT 10,
  max_retries INTEGER NOT NULL DEFAULT 3,
  token_budget_per_job INTEGER NOT NULL DEFAULT 100000,
  allowed_failure_types JSON,
  blocked_branches JSON,
  create_draft_pr BOOLEAN NOT NULL DEFAULT true,
  auto_merge_pr BOOLEAN NOT NULL DEFAULT false,
  auto_merge_threshold REAL NOT NULL DEFAULT 0.95,
  notify_on_start BOOLEAN NOT NULL DEFAULT false,
  notify_on_superseded BOOLEAN NOT NULL DEFAULT true,
  validation_workflow_file VARCHAR(100) NOT NULL DEFAULT 'healops-validation.yml',
  path_language_map JSON,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id),
  name VARCHAR(255) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_healops_branch BOOLEAN NOT NULL DEFAULT false,
  is_protected BOOLEAN NOT NULL DEFAULT false,
  auto_delete_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_repo_name
  ON branches (repository_id, name);
CREATE INDEX IF NOT EXISTS idx_branches_healops_cleanup
  ON branches (is_healops_branch, auto_delete_after);

CREATE TABLE IF NOT EXISTS commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  commit_sha VARCHAR(40) NOT NULL,
  author VARCHAR(255) NOT NULL,
  message TEXT,
  source VARCHAR(50) NOT NULL DEFAULT 'developer',
  committed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commits_repo_sha
  ON commits (repository_id, commit_sha);
CREATE INDEX IF NOT EXISTS idx_commits_branch_source
  ON commits (branch_id, source);

-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 2: Event Ingestion
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id),
  provider VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  external_event_id VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_external_id
  ON webhook_events (external_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_repo_processed
  ON webhook_events (repository_id, processed);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id UUID NOT NULL REFERENCES commits(id),
  webhook_event_id UUID REFERENCES webhook_events(id),
  external_run_id VARCHAR(255) NOT NULL,
  workflow_name VARCHAR(255),
  provider VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  log_url VARCHAR(500),
  extracted_log_snippet TEXT,
  rerun_triggered BOOLEAN NOT NULL DEFAULT false,
  rerun_passed BOOLEAN,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_commit_status
  ON pipeline_runs (commit_id, status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_external_run_id
  ON pipeline_runs (external_run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_workflow_name
  ON pipeline_runs (workflow_name);

CREATE TABLE IF NOT EXISTS error_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  is_auto_fixable BOOLEAN NOT NULL DEFAULT true,
  avg_fix_time_ms INTEGER
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 3: Failure Analysis
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID NOT NULL REFERENCES pipeline_runs(id),
  error_type_id UUID NOT NULL REFERENCES error_types(id),
  error_summary TEXT NOT NULL,
  error_hash VARCHAR(64) NOT NULL,
  raw_error_log TEXT,
  affected_file VARCHAR(500),
  affected_line INTEGER,
  language VARCHAR(50) NOT NULL,
  is_flaky BOOLEAN NOT NULL DEFAULT false,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_failures_pipeline_hash
  ON failures (pipeline_run_id, error_hash);
CREATE INDEX IF NOT EXISTS idx_failures_error_hash
  ON failures (error_hash);
CREATE INDEX IF NOT EXISTS idx_failures_is_flaky
  ON failures (is_flaky);

CREATE TABLE IF NOT EXISTS flaky_failure_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id),
  error_hash VARCHAR(64) NOT NULL,
  test_name VARCHAR(500),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  distinct_commits INTEGER NOT NULL DEFAULT 1,
  flaky_confirmed BOOLEAN NOT NULL DEFAULT false,
  suppressed_until TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flaky_repo_hash
  ON flaky_failure_registry (repository_id, error_hash);
CREATE INDEX IF NOT EXISTS idx_flaky_confirmed
  ON flaky_failure_registry (flaky_confirmed);

-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 4: Agent Execution
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_id UUID NOT NULL REFERENCES failures(id),
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  classified_failure_type VARCHAR(100),
  confidence REAL,
  max_retries INTEGER NOT NULL DEFAULT 3,
  current_retry INTEGER NOT NULL DEFAULT 0,
  token_budget INTEGER NOT NULL DEFAULT 100000,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  superseded_by_commit VARCHAR(40),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_failure_status
  ON jobs (failure_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created
  ON jobs (status, created_at);

CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  attempt_number INTEGER NOT NULL,
  analysis_output JSON,
  fix_fingerprint VARCHAR(64),
  secret_redactions_count INTEGER NOT NULL DEFAULT 0,
  validation_run_id UUID REFERENCES pipeline_runs(id),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attempts_job_number
  ON attempts (job_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_attempts_job_fingerprint
  ON attempts (job_id, fix_fingerprint);
CREATE INDEX IF NOT EXISTS idx_attempts_validation_run
  ON attempts (validation_run_id);

CREATE TABLE IF NOT EXISTS patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES attempts(id) UNIQUE,
  diff_content TEXT NOT NULL,
  files_modified JSON NOT NULL,
  patch_size INTEGER NOT NULL,
  has_type_assertions BOOLEAN NOT NULL DEFAULT false,
  has_empty_catch BOOLEAN NOT NULL DEFAULT false,
  security_scan_status VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES attempts(id),
  stage VARCHAR(20) NOT NULL,
  build_status VARCHAR(20) NOT NULL,
  test_status VARCHAR(20) NOT NULL,
  build_log_excerpt TEXT,
  test_log_excerpt TEXT,
  build_log_url VARCHAR(500),
  test_log_url VARCHAR(500),
  runtime_version VARCHAR(50),
  coverage_percent REAL,
  security_scan_status VARCHAR(50),
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- CRITICAL: One pre_check row + one runner row per attempt
CREATE UNIQUE INDEX IF NOT EXISTS idx_validations_attempt_stage
  ON validations (attempt_id, stage);

-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 5: Outputs
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pull_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  external_pr_id VARCHAR(100) NOT NULL,
  pr_url VARCHAR(500) NOT NULL,
  source_branch VARCHAR(255) NOT NULL,
  target_branch VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  is_draft BOOLEAN NOT NULL DEFAULT true,
  superseded_at TIMESTAMPTZ,
  superseded_by_commit VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  merged_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pr_job_status
  ON pull_requests (job_id, status);
CREATE INDEX IF NOT EXISTS idx_pr_target_status
  ON pull_requests (target_branch, status);

CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  escalation_type VARCHAR(50) NOT NULL,
  external_issue_id VARCHAR(100),
  issue_url VARCHAR(500),
  reason TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_escalations_job_type
  ON escalations (job_id, escalation_type);
CREATE INDEX IF NOT EXISTS idx_escalations_resolved
  ON escalations (resolved_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 6: Intelligence (pgvector)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vector_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  error_embedding vector(1536),
  context_hash VARCHAR(64) NOT NULL UNIQUE,
  failure_type VARCHAR(100) NOT NULL,
  language VARCHAR(50) NOT NULL,
  successful_patch TEXT NOT NULL,
  confidence REAL NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vector_memory_context_hash
  ON vector_memory (context_hash);
CREATE INDEX IF NOT EXISTS idx_vector_memory_repo_lang_type
  ON vector_memory (repository_id, language, failure_type);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_vector_memory_embedding
  ON vector_memory USING hnsw (error_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 7: Operations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS slack_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  type VARCHAR(100) NOT NULL,
  channel VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  slack_thread_ts VARCHAR(50),
  message_preview VARCHAR(200),
  payload JSON NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_slack_job_type
  ON slack_notifications (job_id, type);

CREATE TABLE IF NOT EXISTS healops_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  actor_type VARCHAR(50) NOT NULL,
  actor_id VARCHAR(255),
  old_value JSON,
  new_value JSON,
  metadata JSON,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_audit_entity
  ON healops_audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pp_audit_created
  ON healops_audit_logs (created_at);

CREATE TABLE IF NOT EXISTS cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  repository_id UUID REFERENCES repositories(id),
  period_month DATE NOT NULL,
  total_input_tokens BIGINT NOT NULL DEFAULT 0,
  total_output_tokens BIGINT NOT NULL DEFAULT 0,
  total_jobs INTEGER NOT NULL DEFAULT 0,
  total_jobs_succeeded INTEGER NOT NULL DEFAULT 0,
  total_jobs_escalated INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 4) NOT NULL DEFAULT 0,
  budget_limit_usd DECIMAL(10, 4),
  budget_exhausted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_org_repo_month
  ON cost_tracking (organization_id, repository_id, period_month);
CREATE INDEX IF NOT EXISTS idx_cost_budget_exhausted
  ON cost_tracking (budget_exhausted);

CREATE TABLE IF NOT EXISTS job_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id),
  branch_name VARCHAR(255) NOT NULL,
  failure_type VARCHAR(100) NOT NULL,
  triggered_by_job_id UUID NOT NULL REFERENCES jobs(id),
  cooldown_reason VARCHAR(50) NOT NULL,
  cooldown_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cooldown_repo_branch_type
  ON job_cooldowns (repository_id, branch_name, failure_type);
CREATE INDEX IF NOT EXISTS idx_cooldown_until
  ON job_cooldowns (cooldown_until);
