import { ToolLoopAgent, tool, Output } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { model } from '@/lib/ai/model';

const personalizationAgent = new ToolLoopAgent({
  model,
  instructions: `You are an outreach personalization agent for Onboard, a stablecoin-powered cross-border payments platform for African SMEs. Generate personalized outreach that feels human and references what you know about the company. Adapt your tone and length to the context.`,
  output: Output.object({
    schema: z.object({
      subject: z.string(),
      body: z.string(),
      cta: z.string(),
      personalizationNotes: z.string(),
    }),
  }),
});

export const generateOutreach = tool({
  description: 'Generate personalized outreach and store it in the database.',
  inputSchema: z.object({
    leadId: z.string(),
    company: z.string(),
    contactName: z.string(),
    contactRole: z.string(),
    country: z.string(),
    industry: z.string(),
    segment: z.string().optional(),
    score: z.number().optional(),
    signals: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
    campaignGoal: z.string().optional(),
  }),
  execute: async ({ leadId, company, contactName, contactRole, country, industry, segment, score, signals, campaignGoal }, { abortSignal }) => {
    const signalText = (signals ?? []).map(s => `${s.type}: ${s.value}`).join('; ');

    const result = await personalizationAgent.generate({
      abortSignal,
      prompt: `Generate personalized outreach for ${company} (${industry}, ${country}). Contact: ${contactName} (${contactRole}). Score: ${score ?? 'N/A'}. Signals: ${signalText || 'none'}. Goal: ${campaignGoal ?? 'Book a call'}.`,
    });

    if (result.output) {
      const { subject, body, cta, personalizationNotes } = result.output;

      const [lead] = await db.select({ meta: leads.meta }).from(leads).where(eq(leads.id, leadId)).limit(1);
      const existing = (lead?.meta as Record<string,unknown> | null) ?? {};

      await db.update(leads).set({
        state: 'queued',
        stateChangedAt: new Date(),
        meta: { ...existing, outreach: { subject, body, cta, notes: personalizationNotes, generatedAt: new Date().toISOString() } },
      }).where(eq(leads.id, leadId));

      return { subject, body, cta, personalizationNotes };
    }

    return { subject: '', body: result.text };
  },
});
