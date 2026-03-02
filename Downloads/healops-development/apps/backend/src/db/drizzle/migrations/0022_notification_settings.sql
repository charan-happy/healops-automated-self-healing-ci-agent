-- ─── Notification Settings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  channel VARCHAR(50) NOT NULL,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_settings_org_user_channel
  ON notification_settings (
    organization_id,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    channel
  );
CREATE INDEX IF NOT EXISTS idx_notification_settings_org_active
  ON notification_settings (organization_id, is_active) WHERE is_active = true;
