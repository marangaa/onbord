import { db } from '@/lib/db';
import { campaigns, templates, experiments } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const result = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));

  const withData = await Promise.all(result.map(async (c) => {
    const tpl = await db.select().from(templates).where(eq(templates.campaignId, c.id));
    const exps = await db.select().from(experiments).where(eq(experiments.campaignId, c.id));
    return { ...c, templates: tpl, experiments: exps };
  }));

  return Response.json(withData);
}
