// ─── Public Reviews Schema ──────────────────────────────────────────────────
// User-facing testimonials/reviews visible on the landing page.
// Moderated via is_approved flag before public display.

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
} from 'drizzle-orm/pg-core';

export const publicReviews = pgTable(
  'public_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userName: varchar('user_name', { length: 100 }).notNull(),
    userEmail: varchar('user_email', { length: 255 }),
    userRole: varchar('user_role', { length: 100 }),
    userCompany: varchar('user_company', { length: 150 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    rating: integer('rating').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    comment: text('comment').notNull(),
    isApproved: boolean('is_approved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_public_reviews_approved').on(table.isApproved, table.createdAt),
    index('idx_public_reviews_rating').on(table.rating),
  ],
);
