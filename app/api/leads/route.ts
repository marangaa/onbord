import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  const result = await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(100);
  return Response.json(result);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { company, contactName, contactRole, contactEmail, country, industry } = body;

  if (!company || !country || !industry) {
    return Response.json(
      { error: 'company, country, and industry are required' },
      { status: 400 },
    );
  }

  const [lead] = await db
    .insert(leads)
    .values({
      company: company.trim(),
      contactName: (contactName ?? '').trim() || 'Unknown',
      contactRole: (contactRole ?? '').trim() || '',
      contactEmail: (contactEmail ?? '').trim() || null,
      country: country.trim(),
      industry: industry.trim(),
    })
    .returning();

  return Response.json(lead, { status: 201 });
}
