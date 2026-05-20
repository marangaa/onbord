import { NextResponse } from 'next/server';
import { modelName } from '@/lib/ai/model';
import { gtmOrchestrator } from '@/lib/agents/orchestrator';

export async function GET() {
  const tools = Object.keys(gtmOrchestrator.tools || {});
  
  const suggestions = [
    { label: 'Import Lead', desc: 'Add Kobo360, Nigeria, logistics', cmd: 'Add Kobo360, Nigeria, logistics, contact: Obi' },
    { label: 'Research & Enrich', desc: 'Enrich new leads', cmd: 'Enrich all new leads in the pipeline' },
    { label: 'Grade & Segment', desc: 'Score company profiles', cmd: 'Score all enriched leads' },
    { label: 'Outreach Personalization', desc: 'Generate outreach for scored leads', cmd: 'Generate outreach for scored leads' },
  ];

  return NextResponse.json({
    modelName,
    tools,
    suggestions,
    executionLayer: 'PostgreSQL & Drizzle ORM',
    status: 'online',
  });
}
