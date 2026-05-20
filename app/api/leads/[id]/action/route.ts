import { db } from '@/lib/db';
import { leads, signals } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { enrichLead } from '@/lib/agents/enrichment';
import { scoreLead } from '@/lib/agents/scoring';
import { generateOutreach } from '@/lib/agents/personalization';
import { transitionState } from '@/lib/agents/tools/lead-tools';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  if (!id) {
    return Response.json({ error: 'Lead ID is required' }, { status: 400 });
  }

  // Load current lead data
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) {
    return Response.json({ error: 'Lead not found' }, { status: 404 });
  }

  // Load lead signals
  const leadSignals = await db
    .select()
    .from(signals)
    .where(eq(signals.leadId, id))
    .orderBy(desc(signals.detectedAt));

  try {
    switch (action) {
      case 'enrich': {
        const result = await enrichLead.execute!(
          {
            leadId: lead.id,
            company: lead.company,
            country: lead.country,
            industry: lead.industry,
            contactRole: lead.contactRole || undefined,
          },
          { toolCallId: 'ui-enrich', messages: [] }
        );
        return Response.json({ success: true, result });
      }

      case 'score': {
        const result = await scoreLead.execute!(
          {
            leadId: lead.id,
            company: lead.company,
            country: lead.country,
            industry: lead.industry,
            signals: leadSignals.map((s) => ({
              type: s.type,
              source: s.source,
              value: s.value,
            })),
          },
          { toolCallId: 'ui-score', messages: [] }
        );

        // Transition state to 'scored' explicitly since scoring worker updates score/segment but doesn't touch state
        await transitionState.execute!(
          { leadId: lead.id, to: 'scored' },
          { toolCallId: 'ui-score-transition', messages: [] }
        );

        return Response.json({ success: true, result });
      }

      case 'outreach': {
        const result = await generateOutreach.execute!(
          {
            leadId: lead.id,
            company: lead.company,
            contactName: lead.contactName,
            contactRole: lead.contactRole,
            country: lead.country,
            industry: lead.industry,
            segment: lead.segment || undefined,
            score: lead.score || undefined,
            signals: leadSignals.map((s) => ({
              type: s.type,
              value: s.value,
            })),
          },
          { toolCallId: 'ui-outreach', messages: [] }
        );
        return Response.json({ success: true, result });
      }

      case 'book': {
        const result = await transitionState.execute!(
          { leadId: lead.id, to: 'booked' },
          { toolCallId: 'ui-book', messages: [] }
        );
        return Response.json({ success: true, result });
      }

      default:
        return Response.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error(`Error executing action ${action} on lead ${id}:`, error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
