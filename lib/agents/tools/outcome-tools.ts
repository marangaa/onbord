import { tool } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { leads, events, signals } from '@/lib/db/schema';
import { eq, and, lte, desc } from 'drizzle-orm';

/**
 * BD logs the outcome after manually sending outreach.
 * This closes the feedback loop — the orchestrator uses these outcomes
 * to improve future outreach recommendations for leads in the same segment.
 */
export const logOutcome = tool({
  description:
    'Log the outcome after BD sends outreach to a lead. Records what happened and optionally updates the lead state.',
  inputSchema: z.object({
    leadId: z.string().describe('The lead UUID'),
    outcome: z
      .enum(['replied', 'ignored', 'booked', 'bounced', 'out_of_office', 'not_interested'])
      .describe('What happened after outreach was sent'),
    notes: z
      .string()
      .optional()
      .describe(
        'Context notes — e.g. "Said they\'d revisit in Q3", "Wrong contact, try CFO instead", "Booked call for next Tuesday"',
      ),
    newState: z
      .enum(['active', 'booked', 'stalled', 'disqualified'])
      .optional()
      .describe('Update lead state if appropriate'),
  }),
  execute: async ({ leadId, outcome, notes, newState }) => {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return { error: `Lead ${leadId} not found` };

    const existingNotes = (lead.notes as Array<{ at: string; outcome: string; text?: string }>) ?? [];
    const newNote = {
      at: new Date().toISOString(),
      outcome,
      ...(notes ? { text: notes } : {}),
    };

    const updateData: Record<string, unknown> = {
      notes: [...existingNotes, newNote],
    };

    if (newState) {
      updateData.state = newState;
      updateData.stateChangedAt = new Date();
    } else {
      // Auto-transition based on outcome
      if (outcome === 'replied' || outcome === 'booked') {
        updateData.state = outcome === 'booked' ? 'booked' : 'active';
        updateData.stateChangedAt = new Date();
      } else if (outcome === 'not_interested') {
        updateData.state = 'disqualified';
        updateData.stateChangedAt = new Date();
      }
    }

    await db.update(leads).set(updateData).where(eq(leads.id, leadId));

    return {
      success: true,
      outcome,
      notes: newNote,
      newState: updateData.state ?? lead.state,
    };
  },
});

/**
 * Orchestrator-facing tool — summarises the pipeline for the BD's daily review.
 * Returns stale and ready-to-action leads so the orchestrator can give specific recommendations.
 */
export const reviewPipeline = tool({
  description:
    'Summarise the current pipeline for a daily review. Returns leads that are stale, ready to send, or need attention, with their context.',
  inputSchema: z.object({
    daysStale: z
      .number()
      .default(5)
      .describe('Consider a lead stale if no state change in this many days'),
    segment: z
      .string()
      .optional()
      .describe('Filter to a specific segment (partial match)'),
  }),
  execute: async ({ daysStale, segment }) => {
    const cutoff = new Date(Date.now() - daysStale * 86400000);

    // Leads in active pipeline states
    const pipelineLeads = await db
      .select()
      .from(leads)
      .where(
        and(
          // Not terminal states
          // We want: new, enriched, scored, queued, active, lukewarm, hot
          // Exclude: booked, stalled, disqualified, error
        ),
      )
      .orderBy(desc(leads.stateChangedAt))
      .limit(50);

    // Separate by freshness
    const stale = pipelineLeads.filter(
      (l) =>
        ['queued', 'active', 'lukewarm', 'hot'].includes(l.state) &&
        new Date(l.stateChangedAt) < cutoff,
    );

    const readyToSend = pipelineLeads.filter((l) => l.state === 'queued');
    const inProgress = pipelineLeads.filter((l) => ['active', 'lukewarm', 'hot'].includes(l.state));
    const needsEnrichment = pipelineLeads.filter((l) => ['new'].includes(l.state));

    // Enrich stale leads with their last event
    const staleWithContext = await Promise.all(
      stale.slice(0, 10).map(async (l) => {
        const lastEvents = await db
          .select()
          .from(events)
          .where(eq(events.leadId, l.id))
          .orderBy(desc(events.occurredAt))
          .limit(1);

        const lastSignals = await db
          .select()
          .from(signals)
          .where(eq(signals.leadId, l.id))
          .orderBy(desc(signals.detectedAt))
          .limit(2);

        const meta = l.meta as Record<string, unknown>;
        const outreach = meta?.outreach as Record<string, string> | undefined;

        return {
          id: l.id,
          company: l.company,
          country: l.country,
          segment: l.segment,
          score: l.score,
          state: l.state,
          daysSinceChange: Math.floor((Date.now() - new Date(l.stateChangedAt).getTime()) / 86400000),
          lastEvent: lastEvents[0] ?? null,
          topSignals: lastSignals.map((s) => `${s.type}: ${s.value}`),
          outreachSubject: outreach?.subject ?? null,
        };
      }),
    );

    return {
      summary: {
        totalInPipeline: pipelineLeads.length,
        readyToSend: readyToSend.length,
        inProgress: inProgress.length,
        stale: stale.length,
        needsEnrichment: needsEnrichment.length,
      },
      staleLeads: staleWithContext,
      readyToSend: readyToSend.slice(0, 5).map((l) => ({
        id: l.id,
        company: l.company,
        score: l.score,
        segment: l.segment,
      })),
    };
  },
});
