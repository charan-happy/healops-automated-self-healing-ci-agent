-- ─── AI Fix System Migration ────────────────────────────────────────────────
-- Creates fix_requests table, updates jobs to support API-driven flow,
-- and seeds the 10 supported error types.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Create fix_requests table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fix_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_message TEXT NOT NULL,
  code_snippet TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  file_path VARCHAR(500),
  language VARCHAR(50),
  branch VARCHAR(255) NOT NULL,
  commit_sha VARCHAR(40) NOT NULL,
  error_hash VARCHAR(64) NOT NULL,
  classified_error_type VARCHAR(100),
  is_in_scope BOOLEAN,
  scope_reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'received',
  job_id UUID REFERENCES jobs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fix_requests_error_hash
  ON fix_requests (error_hash);
CREATE INDEX IF NOT EXISTS idx_fix_requests_status
  ON fix_requests (status);
CREATE INDEX IF NOT EXISTS idx_fix_requests_branch_commit
  ON fix_requests (branch, commit_sha);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Update jobs table for API-driven flow
-- ═══════════════════════════════════════════════════════════════════════════

-- Make failure_id nullable (API-driven fixes don't come from pipeline failures)
ALTER TABLE jobs ALTER COLUMN failure_id DROP NOT NULL;

-- Add fix_request_id column
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fix_request_id UUID REFERENCES fix_requests(id);

CREATE INDEX IF NOT EXISTS idx_jobs_fix_request
  ON jobs (fix_request_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Seed error_types with the 10 supported types
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO error_types (id, code, description, severity, is_auto_fixable)
VALUES
  (gen_random_uuid(), 'syntax_error', 'Syntax errors (missing braces, parentheses, semicolons)', 'medium', true),
  (gen_random_uuid(), 'import_error', 'Import errors (missing imports, incorrect module paths)', 'medium', true),
  (gen_random_uuid(), 'dto_interface_error', 'DTO/Interface errors (type mismatches, missing properties)', 'medium', true),
  (gen_random_uuid(), 'type_error', 'Type errors (TypeScript compilation failures)', 'medium', true),
  (gen_random_uuid(), 'export_error', 'Export errors (functions not exported from modules)', 'low', true),
  (gen_random_uuid(), 'build_error', 'Build issues (framework decorators, configuration errors)', 'high', true),
  (gen_random_uuid(), 'test_failure', 'Test failures (incorrect assertions, wrong expected values)', 'medium', true),
  (gen_random_uuid(), 'missing_dependency', 'Missing dependencies (packages used but not in package.json)', 'high', true),
  (gen_random_uuid(), 'version_conflict', 'Dependency version conflicts (incompatible package versions)', 'high', true),
  (gen_random_uuid(), 'package_json_error', 'package.json errors (syntax errors, malformed configuration)', 'medium', true)
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Make vector_memory.repository_id nullable for API-driven flow
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE vector_memory ALTER COLUMN repository_id DROP NOT NULL;
