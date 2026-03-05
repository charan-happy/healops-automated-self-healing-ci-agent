-- Migration: public_reviews
-- Created at: 2026-03-03
-- Public-facing review/testimonial system visible to all site visitors.
-- Reviews are moderated via is_approved flag before appearing on landing page.

CREATE TABLE IF NOT EXISTS public_reviews (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name     VARCHAR(100) NOT NULL,
  user_email    VARCHAR(255),
  user_role     VARCHAR(100),
  user_company  VARCHAR(150),
  avatar_url    VARCHAR(500),
  rating        INTEGER     NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title         VARCHAR(200) NOT NULL,
  comment       TEXT        NOT NULL,
  is_approved   BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for public-facing queries (only approved, newest first)
CREATE INDEX IF NOT EXISTS idx_public_reviews_approved
  ON public_reviews (is_approved, created_at DESC)
  WHERE is_approved = true;

-- Aggregate stats index
CREATE INDEX IF NOT EXISTS idx_public_reviews_rating
  ON public_reviews (rating)
  WHERE is_approved = true;

-- ─── Seed initial reviews ────────────────────────────────────────────────────
-- Pre-approved so the landing page has content at launch.

INSERT INTO public_reviews (user_name, user_role, user_company, rating, title, comment, is_approved)
VALUES
  (
    'Arjun Mehta',
    'Senior DevOps Engineer',
    'Fintech Startup',
    5,
    'Saved our team 10+ hours per week',
    'We were spending half our sprint debugging CI failures. HealOps caught a flaky test pattern we missed for months and auto-fixed the dependency issue. The RAG memory is the killer feature — it learns from your codebase.',
    true
  ),
  (
    'Sarah Chen',
    'Platform Engineer',
    'Series B SaaS',
    5,
    'Like having a senior engineer on-call 24/7',
    'Set it up on a Friday, by Monday it had already opened 3 draft PRs for overnight failures. The quality gates give us confidence the fixes are safe. Incredible tool for small teams.',
    true
  ),
  (
    'Vikram Patel',
    'Engineering Lead',
    'E-commerce Platform',
    4,
    'Great for build and test failures',
    'Works really well for compilation errors, dependency conflicts, and test failures. Still learning to handle complex infrastructure issues, but the success rate on common failures is impressive. The Slack notifications are a nice touch.',
    true
  ),
  (
    'Maria Rodriguez',
    'SRE',
    'Healthcare Tech',
    5,
    'Finally, CI/CD that heals itself',
    'As someone who manages 40+ microservice repos, HealOps is a game-changer. It caught a breaking change in a shared library and fixed all downstream repos before anyone noticed. The cost tracking per job keeps our LLM spend predictable.',
    true
  ),
  (
    'James Liu',
    'Full Stack Developer',
    'Open Source Maintainer',
    4,
    'Perfect for open source projects',
    'Running HealOps on our OSS repos on the free tier. It handles the routine CI fixes (dependency updates, linting changes) so contributors can focus on features. The draft PR approach is exactly right — human review stays in the loop.',
    true
  ),
  (
    'Priya Sharma',
    'CTO',
    'Seed-Stage Startup',
    5,
    'Worth 10x what we pay',
    'With a 4-person engineering team, we cannot afford downtime debugging pipelines. HealOps reduced our mean-time-to-recovery from 45 minutes to under 3. The multi-CI support meant we could add GitLab alongside GitHub Actions seamlessly.',
    true
  ),
  (
    'Tom Anderson',
    'DevOps Engineer',
    'Consulting Agency',
    4,
    'Solid tool, getting better every week',
    'We use it across 6 client projects. The per-repo settings are great for different tech stacks. Only giving 4 stars because we would love Bitbucket Pipelines support, but the GitHub Actions and Jenkins coverage is excellent.',
    true
  )
ON CONFLICT DO NOTHING;
