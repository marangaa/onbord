import { tool } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { leads, signals, events, campaigns, leadState } from '@/lib/db/schema';
import { eq, and, gte, lte, like, desc, sql } from 'drizzle-orm';

export const createLead = tool({
  description: 'Create a new lead in the database. Returns the created lead with its ID.',
  inputSchema: z.object({
    company: z.string().describe('Company name'),
    country: z.string().describe('Country code or name'),
    industry: z.string().describe('Industry classification'),
    contactName: z.string().optional().describe('Contact person name'),
    contactRole: z.string().optional().describe('Contact person role'),
    contactEmail: z.string().optional().describe('Contact email'),
  }),
  execute: async (input) => {
    const [lead] = await db
      .insert(leads)
      .values({
        company: input.company.trim(),
        country: input.country.trim(),
        industry: input.industry.trim(),
        contactName: (input.contactName ?? '').trim() || 'Unknown',
        contactRole: (input.contactRole ?? '').trim() || '',
        contactEmail: (input.contactEmail ?? '').trim() || null,
      })
      .returning();

    return { id: lead.id, company: lead.company, state: lead.state };
  },
});

export const queryLeads = tool({
  description:
    'Query leads from the database. Filter by state, segment text search, country, score range, or search by company name.',
  inputSchema: z.object({
    state: z
      .enum(leadState.enumValues)
      .optional()
      .describe('Filter by lead state'),
    segment: z
      .string()
      .optional()
      .describe('Filter by segment (partial text match)'),
    country: z.string().optional().describe('Filter by country'),
    minScore: z.number().min(0).max(100).optional().describe('Minimum score'),
    maxScore: z.number().min(0).max(100).optional().describe('Maximum score'),
    search: z.string().optional().describe('Search company name'),
    limit: z.number().min(1).max(100).default(20),
  }),
  execute: async (filters) => {
    const where = and(
      filters.state ? eq(leads.state, filters.state) : undefined,
      filters.segment ? like(leads.segment, `%${filters.segment}%`) : undefined,
      filters.country ? like(leads.country, `%${filters.country}%`) : undefined,
      filters.minScore !== undefined ? gte(leads.score, filters.minScore) : undefined,
      filters.maxScore !== undefined ? lte(leads.score, filters.maxScore) : undefined,
      filters.search ? like(leads.company, `%${filters.search}%`) : undefined,
    );

    const result = await db
      .select()
      .from(leads)
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(filters.limit);

    return {
      count: result.length,
      leads: result.map((l) => ({
        id: l.id,
        company: l.company,
        contact: `${l.contactName} (${l.contactRole})`,
        country: l.country,
        industry: l.industry,
        state: l.state,
        score: l.score,
        segment: l.segment,
        daysSinceStateChange: l.stateChangedAt
          ? Math.floor((Date.now() - new Date(l.stateChangedAt).getTime()) / 86400000)
          : null,
      })),
    };
  },
});

export const getLead = tool({
  description: 'Get full details for a single lead including their signals and events.',
  inputSchema: z.object({
    leadId: z.string().describe('The lead UUID'),
  }),
  execute: async ({ leadId }) => {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) return { error: `Lead ${leadId} not found` };

    const leadSignals = await db
      .select()
      .from(signals)
      .where(eq(signals.leadId, leadId))
      .orderBy(desc(signals.detectedAt));

    const leadEvents = await db
      .select()
      .from(events)
      .where(eq(events.leadId, leadId))
      .orderBy(desc(events.occurredAt));

    return { lead, signals: leadSignals, events: leadEvents };
  },
});

export const transitionState = tool({
  description: 'Transition a lead to a new state.',
  inputSchema: z.object({
    leadId: z.string().describe('The lead UUID'),
    to: z.enum(leadState.enumValues).describe('Target state'),
  }),
  execute: async ({ leadId, to }) => {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) return { error: `Lead ${leadId} not found` };

    const [updated] = await db
      .update(leads)
      .set({ state: to, stateChangedAt: new Date() })
      .where(eq(leads.id, leadId))
      .returning();

    return {
      success: true,
      previousState: lead.state,
      newState: updated.state,
    };
  },
});

export const updateLeadScore = tool({
  description: 'Update a lead score and optionally reassign their segment.',
  inputSchema: z.object({
    leadId: z.string().describe('The lead UUID'),
    score: z.number().min(0).max(100).describe('New score 0-100'),
    segment: z
      .string()
      .optional()
      .describe('New segment label if reassigning'),
  }),
  execute: async ({ leadId, score, segment }) => {
    const updateData: Record<string, unknown> = { score };
    if (segment) updateData.segment = segment;

    const [updated] = await db
      .update(leads)
      .set(updateData)
      .where(eq(leads.id, leadId))
      .returning();

    if (!updated) return { error: `Lead ${leadId} not found` };

    return { success: true, score: updated.score, segment: updated.segment };
  },
});

export const addSignal = tool({
  description: 'Add a detected buying signal to a lead.',
  inputSchema: z.object({
    leadId: z.string().describe('The lead UUID'),
    type: z
      .string()
      .describe(
        'What kind of signal this is — be specific and descriptive. Examples: "Series A funding round, $4M", "Expanding to Ghana and Côte d\'Ivoire", "New CFO hire from Flutterwave", "Active import from China via Lagos port"',
      ),
    source: z.string().describe('Where the signal was detected (URL, LinkedIn, press release, etc.)'),
    value: z.string().describe('The signal details — include numbers, dates, and context'),
  }),
  execute: async ({ leadId, type, source, value }) => {
    const [signal] = await db
      .insert(signals)
      .values({ leadId, type, source, value })
      .returning();

    return { success: true, signal };
  },
});

export const addEvent = tool({
  description: 'Log an outreach event for a lead (opened email, clicked link, replied, bounced).',
  inputSchema: z.object({
    leadId: z.string().describe('The lead UUID'),
    type: z
      .enum(['opened', 'clicked', 'replied', 'bounced'])
      .describe('Event type'),
    campaignStep: z
      .number()
      .optional()
      .describe('Which step in the outreach sequence'),
  }),
  execute: async ({ leadId, type, campaignStep }) => {
    const [event] = await db
      .insert(events)
      .values({ leadId, type, campaignStep: campaignStep ?? 0 })
      .returning();

    return { success: true, event };
  },
});

export const assignCampaign = tool({
  description: 'Assign a lead to a campaign.',
  inputSchema: z.object({
    leadId: z.string().describe('The lead UUID'),
    campaignId: z.string().describe('The campaign UUID'),
  }),
  execute: async ({ leadId, campaignId }) => {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return { error: `Campaign ${campaignId} not found` };

    const [updated] = await db
      .update(leads)
      .set({ campaignId })
      .where(eq(leads.id, leadId))
      .returning();

    if (!updated) return { error: `Lead ${leadId} not found` };

    return {
      success: true,
      campaign: campaign.name,
      leadState: updated.state,
    };
  },
});

export const getCampaignMetrics = tool({
  description: 'Get campaign metrics including assigned leads and their states.',
  inputSchema: z.object({
    campaignId: z.string().describe('The campaign UUID'),
  }),
  execute: async ({ campaignId }) => {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return { error: `Campaign ${campaignId} not found` };

    const campaignLeads = await db
      .select()
      .from(leads)
      .where(eq(leads.campaignId, campaignId));

    const stateCounts: Record<string, number> = {};
    for (const l of campaignLeads) {
      stateCounts[l.state] = (stateCounts[l.state] || 0) + 1;
    }

    return {
      campaign: campaign.name,
      segment: campaign.segment,
      metrics: campaign.metrics,
      leadCount: campaignLeads.length,
      stateBreakdown: stateCounts,
    };
  },
});
