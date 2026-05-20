import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const VALID_OUTCOMES = ['replied', 'ignored', 'booked', 'bounced', 'out_of_office', 'not_interested'] as const;
type Outcome = typeof VALID_OUTCOMES[number];

const AUTO_STATE: Partial<Record<Outcome, string>> = {
  replied: 'active',
  booked: 'booked',
  not_interested: 'disqualified',
};

export async function POST(request: Request) {
  const body = await request.json();
  const { leadId, outcome, notes } = body;

  if (!leadId || !outcome) {
    return Response.json({ error: 'leadId and outcome are required' }, { status: 400 });
  }

  if (!VALID_OUTCOMES.includes(outcome)) {
    return Response.json({ error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` }, { status: 400 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return Response.json({ error: 'Lead not found' }, { status: 404 });

  const existingNotes = (lead.notes as Array<{ at: string; outcome: string; text?: string }>) ?? [];
  const newNote = { at: new Date().toISOString(), outcome, ...(notes ? { text: notes } : {}) };

  const updateData: Record<string, unknown> = {
    notes: [...existingNotes, newNote],
  };

  const newState = AUTO_STATE[outcome as Outcome];
  if (newState) {
    updateData.state = newState;
    updateData.stateChangedAt = new Date();
  }

  const [updated] = await db.update(leads).set(updateData).where(eq(leads.id, leadId)).returning();

  return Response.json({ success: true, state: updated.state, note: newNote });
}
