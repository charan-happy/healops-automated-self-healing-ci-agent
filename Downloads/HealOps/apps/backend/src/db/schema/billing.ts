// ─── Billing Schema ─────────────────────────────────────────────────────────
// plans, subscriptions, usage_records, invoices

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  bigint,
  date,
  json,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { organizations } from './platform';

// ─── Plans ──────────────────────────────────────────────────────────────────

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  monthlyJobLimit: integer('monthly_job_limit').notNull(),
  monthlyTokenBudget: integer('monthly_token_budget').notNull(),
  features: json('features').notNull().default([]),
  priceCents: integer('price_cents').notNull().default(0),
  billingInterval: varchar('billing_interval', { length: 20 })
    .notNull()
    .default('month'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Subscriptions ──────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end')
      .notNull()
      .default(false),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_subscriptions_stripe_customer').on(table.stripeCustomerId),
    index('idx_subscriptions_stripe_sub').on(table.stripeSubscriptionId),
  ],
);

// ─── Usage Records ──────────────────────────────────────────────────────────

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    periodMonth: date('period_month').notNull(),
    jobsUsed: integer('jobs_used').notNull().default(0),
    tokensUsed: bigint('tokens_used', { mode: 'number' }).notNull().default(0),
    reportedToStripe: boolean('reported_to_stripe').notNull().default(false),
    stripeUsageRecordId: varchar('stripe_usage_record_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_usage_records_org_sub_month').on(
      table.organizationId,
      table.subscriptionId,
      table.periodMonth,
    ),
  ],
);

// ─── Invoices ───────────────────────────────────────────────────────────────

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }).unique(),
    amountCents: integer('amount_cents').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),
    status: varchar('status', { length: 50 }).notNull().default('draft'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    hostedInvoiceUrl: varchar('hosted_invoice_url', { length: 1000 }),
    pdfUrl: varchar('pdf_url', { length: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_invoices_org').on(table.organizationId),
    index('idx_invoices_status').on(table.status),
  ],
);
