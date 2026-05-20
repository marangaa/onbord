import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Lead workflow states — kept as enum because they drive system logic
export const leadState = pgEnum('lead_state', [
  'new',
  'enriched',
  'scored',
  'queued',
  'active',
  'lukewarm',
  'hot',
  'booked',
  'stalled',
  'disqualified',
  'error',
]);

// Engagement events — kept as enum (fixed set of outcomes)
export const eventType = pgEnum('event_type', [
  'opened',
  'clicked',
  'replied',
  'bounced',
]);

// NOTE: leadSegment and signalType enums have been removed.
// Segment is now a free-text field assigned by the LLM at scoring time.
// Signal type is also free-text — the agent describes what it found naturally.

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    company: text('company').notNull(),
    contactName: text('contact_name').notNull(),
    contactRole: text('contact_role').notNull(),
    contactEmail: text('contact_email'),
    country: text('country').notNull(),
    industry: text('industry').notNull(),
    state: leadState('state').notNull().default('new'),
    score: integer('score').default(0),
    // Free-text segment — LLM describes the company's cross-border activity profile
    segment: text('segment'),
    campaignId: uuid('campaign_id').references(() => campaigns.id, {
      onDelete: 'set null',
    }),
    // Research, outreach copy, and other enrichment data
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
    // BD notes and outcome logs — e.g. "Said they'd revisit in Q3", "Wrong contact"
    notes: jsonb('notes').$type<Array<{ at: string; outcome: string; text?: string }>>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    stateChangedAt: timestamp('state_changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('leads_state_idx').on(table.state),
    index('leads_segment_idx').on(table.segment),
    index('leads_company_idx').on(table.company),
    index('leads_country_idx').on(table.country),
  ],
);

export const leadsRelations = relations(leads, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [leads.campaignId],
    references: [campaigns.id],
  }),
  signals: many(signals),
  events: many(events),
}));

export const signals = pgTable(
  'signals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    // Free-text — agent describes the signal naturally e.g. "Series A funding round, $4M"
    type: text('type').notNull(),
    source: text('source').notNull(),
    value: text('value').notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('signals_lead_id_idx').on(table.leadId),
    index('signals_type_idx').on(table.type),
  ],
);

export const signalsRelations = relations(signals, ({ one }) => ({
  lead: one(leads, {
    fields: [signals.leadId],
    references: [leads.id],
  }),
}));

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    type: eventType('type').notNull(),
    campaignStep: integer('campaign_step').default(0),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('events_lead_id_idx').on(table.leadId),
    index('events_type_idx').on(table.type),
  ],
);

export const eventsRelations = relations(events, ({ one }) => ({
  lead: one(leads, {
    fields: [events.leadId],
    references: [leads.id],
  }),
}));

export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  // Free-text segment
  segment: text('segment').notNull(),
  subjectLineA: text('subject_line_a').notNull(),
  subjectLineB: text('subject_line_b').notNull(),
  cta: text('cta').notNull(),
  metrics: jsonb('metrics')
    .$type<{ sent: number; opened: number; clicked: number; replied: number }>()
    .default({ sent: 0, opened: 0, clicked: 0, replied: 0 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  leads: many(leads),
  templates: many(templates),
  experiments: many(experiments),
}));

export const templates = pgTable('templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  variant: text('variant').notNull().default('a'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const templatesRelations = relations(templates, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [templates.campaignId],
    references: [campaigns.id],
  }),
}));

export const experiments = pgTable('experiments', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id')
    .notNull()
    .references(() => templates.id, { onDelete: 'cascade' }),
  variant: text('variant').notNull().default('a'),
  metricTarget: text('metric_target').notNull(),
  results: jsonb('results').$type<Record<string, unknown>>().default({}),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const experimentsRelations = relations(experiments, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [experiments.campaignId],
    references: [campaigns.id],
  }),
  template: one(templates, {
    fields: [experiments.templateId],
    references: [templates.id],
  }),
}));

export type LeadState = (typeof leadState.enumValues)[number];
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Signal = typeof signals.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
