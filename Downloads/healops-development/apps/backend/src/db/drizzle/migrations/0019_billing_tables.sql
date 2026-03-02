-- ─── Stripe Billing Tables ──────────────────────────────────────────────────
-- Plans, subscriptions, usage records, invoices

-- 1. Plans table
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  stripe_price_id VARCHAR(255),
  monthly_job_limit INTEGER NOT NULL,
  monthly_token_budget INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_cents INTEGER NOT NULL DEFAULT 0,
  billing_interval VARCHAR(20) NOT NULL DEFAULT 'month',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans (is_active) WHERE is_active = true;

-- 2. Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_org_active
  ON subscriptions (organization_id) WHERE status IN ('active', 'trialing', 'past_due');
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON subscriptions (stripe_subscription_id);

-- 3. Usage records table
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  period_month DATE NOT NULL,
  jobs_used INTEGER NOT NULL DEFAULT 0,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  reported_to_stripe BOOLEAN NOT NULL DEFAULT false,
  stripe_usage_record_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_records_org_sub_month
  ON usage_records (organization_id, subscription_id, period_month);
CREATE INDEX IF NOT EXISTS idx_usage_records_unreported
  ON usage_records (reported_to_stripe) WHERE reported_to_stripe = false;

-- 4. Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  stripe_invoice_id VARCHAR(255) UNIQUE,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  paid_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  hosted_invoice_url VARCHAR(1000),
  pdf_url VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);

-- 5. Seed default plans
INSERT INTO plans (name, slug, monthly_job_limit, monthly_token_budget, features, price_cents, billing_interval)
VALUES
  ('Free', 'free', 100, 1000000,
   '["5 repositories","Community support","Basic dashboard","GitHub Actions"]'::jsonb,
   0, 'month'),
  ('Pro', 'pro', 1000, 10000000,
   '["Unlimited repositories","Slack integration","Priority support","Advanced analytics","GitLab + Jenkins","Local LLM support"]'::jsonb,
   4900, 'month'),
  ('Enterprise', 'enterprise', 10000, 100000000,
   '["Unlimited repositories","All integrations","Dedicated support","SSO/SAML","Custom SLA","On-prem option","Audit log export"]'::jsonb,
   29900, 'month')
ON CONFLICT (slug) DO NOTHING;

-- 6. Backfill: create free subscriptions for existing organizations
INSERT INTO subscriptions (organization_id, plan_id, status)
SELECT o.id, p.id, 'active'
FROM organizations o
CROSS JOIN plans p
WHERE p.slug = 'free'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.organization_id = o.id AND s.status IN ('active', 'trialing')
  );
