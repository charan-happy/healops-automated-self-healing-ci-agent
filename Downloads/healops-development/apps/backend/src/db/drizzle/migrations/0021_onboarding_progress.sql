-- ─── Onboarding Progress ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  current_step VARCHAR(100) NOT NULL DEFAULT 'create_organization',
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_org_user
  ON onboarding_progress (organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_incomplete
  ON onboarding_progress (completed_at) WHERE completed_at IS NULL;
