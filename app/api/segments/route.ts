import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  const result = await db
    .select({ segment: leads.segment })
    .from(leads)
    .where(sql`${leads.segment} IS NOT NULL`)
    .groupBy(leads.segment);

  return Response.json(result.map(r => r.segment).filter(Boolean));
}
