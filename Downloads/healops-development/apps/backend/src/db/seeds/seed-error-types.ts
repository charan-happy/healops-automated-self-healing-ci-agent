// ─── Error Types Seed Runner ────────────────────────────────────────────────
// Usage: pnpm db:seed:healops
//
// Seeds the error_types table with the 10 supported failure categories.
// Uses ON CONFLICT to safely re-run without duplicates.

import 'dotenv/config';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { errorTypes } from '../schema/ingestion';
import { ERROR_TYPES_SEED } from './error-types';

async function seedErrorTypes(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const db = drizzle(client);

    console.log('Seeding error_types table...');

    for (const errorType of ERROR_TYPES_SEED) {
      await db
        .insert(errorTypes)
        .values({
          code: errorType.code,
          description: errorType.description,
          severity: errorType.severity,
          isAutoFixable: errorType.is_auto_fixable,
        })
        .onConflictDoNothing({ target: errorTypes.code });
    }

    console.log(`Seeded ${String(ERROR_TYPES_SEED.length)} error types successfully.`);
  } catch (error) {
    console.error('Seed failed:', (error as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedErrorTypes().catch(console.error);
