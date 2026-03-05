-- ─── SCM Provider Configs ──────────────────────────────────────────────────
-- Dedicated table for Source Code Management provider connections (GitHub, GitLab, Bitbucket).
-- Separate from ci_provider_configs which handles CI/CD pipeline tools.

CREATE TABLE IF NOT EXISTS scm_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  provider_type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_provider_configs_org_type
  ON scm_provider_configs (organization_id, provider_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scm_provider_configs_org_type_active
  ON scm_provider_configs (organization_id, provider_type) WHERE is_active = true;
