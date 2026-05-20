import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import PipelineClient from './client';

export default async function PipelinePage() {
  const allLeads = await db.select().from(leads).orderBy(desc(leads.createdAt));
  return <PipelineClient leads={allLeads} />;
}
