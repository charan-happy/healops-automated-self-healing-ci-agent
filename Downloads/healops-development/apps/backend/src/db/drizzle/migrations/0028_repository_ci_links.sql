-- repository_ci_links: many-to-many mapping between repositories and CI providers
-- Allows a single repo to be linked to multiple CI systems (e.g., GitLab CI + Jenkins)
-- with optional custom pipeline/job name per link.

CREATE TABLE IF NOT EXISTS "repository_ci_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repository_id" uuid NOT NULL REFERENCES "repositories"("id"),
  "ci_provider_config_id" uuid NOT NULL REFERENCES "ci_provider_configs"("id"),
  "pipeline_name" varchar(255),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_repo_ci_links_unique"
  ON "repository_ci_links" ("repository_id", "ci_provider_config_id");

CREATE INDEX IF NOT EXISTS "idx_repo_ci_links_repo"
  ON "repository_ci_links" ("repository_id");
