/**
 * Applies Drizzle SQL migrations using only the pg client.
 * Reads meta/_journal.json for order and runs each .sql file, recording in __drizzle_migrations__.
 */
import 'dotenv/config';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, 'meta', '_journal.json');

async function runMigrations() {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf-8')) as {
      entries: Array< { tag: string } >;
    };
    const entries = journal.entries ?? [];

    await client.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL UNIQUE,
        created_at bigint
      )
    `);

    const applied = await client.query('SELECT hash FROM "__drizzle_migrations"');
    const appliedSet = new Set((applied.rows as { hash: string }[]).map((r) => r.hash));

    console.log('Running migrations...');

    for (const entry of entries) {
      const tag = entry.tag;
      const sqlPath = path.join(MIGRATIONS_DIR, `${tag}.sql`);
      if (!fs.existsSync(sqlPath)) {
        console.warn(`Skipping ${tag}: file not found`);
        continue;
      }
      const hash = tag;
      if (appliedSet.has(hash)) {
        console.log(`  [skip] ${tag}`);
        continue;
      }
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
          [hash, Date.now()],
        );
        await client.query('COMMIT');
        console.log(`  [ok] ${tag}`);
      } catch (err: unknown) {
        await client.query('ROLLBACK');
        const code = (err as { code?: string })?.code;
        const msg = String((err as Error)?.message ?? '');
        // Already exists / duplicate: assume migration was applied previously, mark and continue
        if (code === '42710' || code === '42P07' || code === '42P01' || /already exists/i.test(msg)) {
          await client.query(
            'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING',
            [hash, Date.now()],
          ).catch(() => {});
          appliedSet.add(hash);
          console.log(`  [already applied] ${tag}`);
        } else {
          throw err;
        }
      }
    }

    console.log('Migrations completed successfully.');
  } finally {
    await client.end();
  }
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
