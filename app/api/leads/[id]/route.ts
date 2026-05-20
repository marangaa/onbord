import { db } from '@/lib/db';
import { leads, signals, campaigns, events } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) return Response.json({ error: 'Not found' }, { status: 404 });

  const [leadSignals, leadEvents, segmentCampaigns] = await Promise.all([
    db.select().from(signals).where(eq(signals.leadId, id)).orderBy(desc(signals.detectedAt)),
    db.select().from(events).where(eq(events.leadId, id)).orderBy(desc(events.occurredAt)),
    lead.segment ? db.select().from(campaigns).where(eq(campaigns.segment, lead.segment)) : Promise.resolve([]),
  ]);

  return Response.json({ ...lead, signals: leadSignals, events: leadEvents, campaigns: segmentCampaigns });
}
