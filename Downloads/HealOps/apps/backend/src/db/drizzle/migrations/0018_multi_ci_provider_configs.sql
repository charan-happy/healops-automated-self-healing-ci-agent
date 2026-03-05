-- ─── Multi-CI Provider Configs ──────────────────────────────────────────────
-- Adds multi-CI provider support: provider config table, org slug, repo FK

-- 1. Add slug to organizations (needed for URL routing)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
UPDATE organizations SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;
ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations (slug);

-- 2. Create ci_provider_configs table
CREATE TABLE IF NOT EXISTS ci_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  provider_type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ci_provider_configs_org_type
  ON ci_provider_configs (organization_id, provider_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ci_provider_configs_org_type_active
  ON ci_provider_configs (organization_id, provider_type) WHERE is_active = true;

-- 3. Add ci_provider_config_id FK to repositories
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS ci_provider_config_id UUID REFERENCES ci_provider_configs(id);
CREATE INDEX IF NOT EXISTS idx_repositories_ci_provider_config
  ON repositories (ci_provider_config_id);

-- 4. Backfill: create ci_provider_configs from existing github_installation_id values
INSERT INTO ci_provider_configs (organization_id, provider_type, config, display_name)
SELECT DISTINCT
  r.organization_id,
  'github',
  jsonb_build_object('installationId', r.github_installation_id),
  'GitHub (migrated)'
FROM repositories r
WHERE r.github_installation_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5. Link existing repos to their migrated configs
UPDATE repositories r
SET ci_provider_config_id = cpc.id
FROM ci_provider_configs cpc
WHERE r.organization_id = cpc.organization_id
  AND cpc.provider_type = 'github'
  AND r.github_installation_id IS NOT NULL
  AND r.provider = 'github';
