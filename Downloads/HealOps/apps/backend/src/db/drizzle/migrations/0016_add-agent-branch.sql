-- Migration: add-agent-branch
-- Created at: 2026-02-28T18:12:09.499Z

ALTER TABLE "pipeline_runs" ADD COLUMN "agent_branch" varchar(255);
