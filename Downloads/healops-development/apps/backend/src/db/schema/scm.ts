// ─── SCM Provider Schema ─────────────────────────────────────────────────
// Source Code Management provider configurations (GitHub, GitLab, Bitbucket).

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  json,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './platform';

export const scmProviderConfigs = pgTable(
  'scm_provider_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    providerType: varchar('provider_type', { length: 50 }).notNull(),
    config: json('config').notNull().default({}),
    displayName: varchar('display_name', { length: 255 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_scm_provider_configs_org_type').on(
      table.organizationId,
      table.providerType,
    ),
  ],
);
