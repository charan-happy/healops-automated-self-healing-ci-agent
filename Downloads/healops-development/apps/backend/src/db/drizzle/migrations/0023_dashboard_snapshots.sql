-- ─── Dashboard Snapshots ────────────────────────────────────────────────────
-- Cached dashboard metrics to avoid expensive aggregation queries

CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  repository_id UUID REFERENCES repositories(id),
  snapshot_type VARCHAR(20) NOT NULL,
  snapshot_date DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_snapshot_key
  ON dashboard_snapshots (
    organization_id,
    COALESCE(repository_id, '00000000-0000-0000-0000-000000000000'::uuid),
    snapshot_type,
    snapshot_date
  );
CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_org_type
  ON dashboard_snapshots (organization_id, snapshot_type, snapshot_date DESC);
