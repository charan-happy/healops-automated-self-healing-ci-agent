-- Add fix attempt tracking to pipeline_runs for CI validation retry flow.
-- fix_attempt: current retry number (0 = no fix attempted yet, 1 = first attempt, etc.)
-- max_fix_attempts: maximum retries before escalation (default 3)

ALTER TABLE pipeline_runs ADD COLUMN fix_attempt integer NOT NULL DEFAULT 0;
ALTER TABLE pipeline_runs ADD COLUMN max_fix_attempts integer NOT NULL DEFAULT 3;
