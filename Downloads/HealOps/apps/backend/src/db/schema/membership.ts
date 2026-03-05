// ─── Membership & Onboarding Schema ─────────────────────────────────────────
// organization_members, organization_invitations, onboarding_progress,
// notification_settings, dashboard_snapshots, ci_provider_configs

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  date,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { organizations, repositories } from './platform';

// ─── CI Provider Configs ────────────────────────────────────────────────────

export const ciProviderConfigs = pgTable(
  'ci_provider_configs',
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
    index('idx_ci_provider_configs_org_type').on(
      table.organizationId,
      table.providerType,
    ),
  ],
);

// ─── Organization Members ───────────────────────────────────────────────────

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id').notNull(),
    role: varchar('role', { length: 50 }).notNull().default('member'),
    invitedBy: uuid('invited_by'),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_org_members_org_user').on(
      table.organizationId,
      table.userId,
    ),
    index('idx_org_members_user').on(table.userId),
  ],
);

// ─── Organization Invitations ───────────────────────────────────────────────

export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    email: varchar('email', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull().default('member'),
    token: varchar('token', { length: 255 }).notNull().unique(),
    invitedBy: uuid('invited_by'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_org_invitations_org_email').on(
      table.organizationId,
      table.email,
    ),
  ],
);

// ─── Onboarding Progress ────────────────────────────────────────────────────

export const onboardingProgress = pgTable(
  'onboarding_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id').notNull(),
    currentStep: varchar('current_step', { length: 100 })
      .notNull()
      .default('create_organization'),
    completedSteps: json('completed_steps').notNull().default([]),
    data: json('data').notNull().default({}),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_onboarding_org_user').on(
      table.organizationId,
      table.userId,
    ),
  ],
);

// ─── Notification Settings ──────────────────────────────────────────────────

export const notificationSettings = pgTable(
  'notification_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id'),
    channel: varchar('channel', { length: 50 }).notNull(),
    events: json('events').notNull().default([]),
    config: json('config').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_notification_settings_org_active').on(
      table.organizationId,
      table.isActive,
    ),
  ],
);

// ─── Dashboard Snapshots ────────────────────────────────────────────────────

export const dashboardSnapshots = pgTable(
  'dashboard_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    repositoryId: uuid('repository_id').references(() => repositories.id),
    snapshotType: varchar('snapshot_type', { length: 20 }).notNull(),
    snapshotDate: date('snapshot_date').notNull(),
    metrics: json('metrics').notNull().default({}),
    computedAt: timestamp('computed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_dashboard_snapshots_org_type').on(
      table.organizationId,
      table.snapshotType,
    ),
  ],
);
