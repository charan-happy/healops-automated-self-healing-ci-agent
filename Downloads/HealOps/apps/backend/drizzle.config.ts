import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/db/drizzle/migrations',
  schema: [
    // Legacy boilerplate schema
    './src/db/drizzle/schema.ts',
    // HealOps schema (21 tables across 7 tiers)
    './src/db/schema/platform.ts',
    './src/db/schema/ingestion.ts',
    './src/db/schema/analysis.ts',
    './src/db/schema/fix-requests.ts',
    './src/db/schema/agent.ts',
    './src/db/schema/outputs.ts',
    './src/db/schema/intelligence.ts',
    './src/db/schema/operations.ts',
  ],
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL']!,
  },
  verbose: true,
  strict: true,
});
