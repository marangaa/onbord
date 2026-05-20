import { generateText, tool, stepCountIs } from 'ai';
import { tavilySearch } from '@tavily/ai-sdk';
import { z } from 'zod';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { model } from '@/lib/ai/model';

export const enrichLead = tool({
  description: 'Research a lead using Tavily web search. Detects signals (funding, expansion, hires, FX activity, competitors) and stores research results.',
  inputSchema: z.object({
    leadId: z.string(),
    company: z.string(),
    country: z.string(),
    industry: z.string(),
    contactRole: z.string().optional(),
  }),
  execute: async ({ leadId, company, country, industry, contactRole }, { abortSignal }) => {
    try {
      const { text } = await generateText({
        model,
        abortSignal,
        tools: { webSearch: tavilySearch() },
        stopWhen: stepCountIs(5),
        maxOutputTokens: 4000,
        prompt: `Research ${company} (${industry}, ${country}).

Find and report on:
- Funding rounds (amounts, dates, investors)
- Geographic expansion into new African markets
- Cross-border payment activity or FX pain points
- Recent senior hires (CFO, Head of Finance, Ops, Payments)
- Competitor mentions or technology stack signals
- Import/export or trade volume indicators
- Any signal that suggests they need better cross-border payment infrastructure

Be specific. Include numbers, dates, and sources where available.`,
      });

      await db.update(leads).set({
        state: 'enriched',
        stateChangedAt: new Date(),
        meta: { research: text },
      }).where(eq(leads.id, leadId));

      return { summary: `Research complete. ${text.length} chars.`, text };
    } catch (e) {
      return { summary: `Error: ${e instanceof Error ? e.message : 'Failed'}`, text: '' };
    }
  },
});
