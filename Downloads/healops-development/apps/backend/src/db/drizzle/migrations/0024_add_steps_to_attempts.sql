-- Migration: add_steps_to_attempts
-- Created at: 2026-03-02T16:29:36.777Z

-- Add steps column to track agent thinking process per attempt
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS steps jsonb DEFAULT '[]'::jsonb;
