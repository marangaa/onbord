import { ToolLoopAgent, tool, Output } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { model } from '@/lib/ai/model';

const scoringAgent = new ToolLoopAgent({
  model,
  instructions: `You are a lead scoring agent for Onboard, a stablecoin-powered cross-border payments platform for African SMEs.

Evaluate each lead holistically against Onboard's ICP: African businesses that move money across borders — importers, exporters, fintechs, freight forwarders, B2B services with cross-border supplier or customer relationships.

Assign:
1. A score from 0–100 (higher = better fit + stronger signals + more FX volume potential)
2. A segment label — be SPECIFIC and descriptive, not generic. Examples:
   - "West Africa freight forwarder — high import volume" 
   - "Nigerian fintech, B2B cross-border payments"
   - "East Africa SME importer, consumer goods from China"
   - "Pan-Africa e-commerce, multi-currency checkout problem"
   Never use generic labels like "fintech" or "SME" alone. Describe what they actually do.

Score breakdown:
- ICP fit (0–40): How well does their business model require cross-border FX flows?
- Signal strength (0–30): How strong and recent are the buying signals detected?
- Volume potential (0–30): How much FX volume could they plausibly move?`,
  output: Output.object({
    schema: z.object({
      totalScore: z.number().min(0).max(100),
      icpFitScore: z.number().min(0).max(40),
      signalStrengthScore: z.number().min(0).max(30),
      volumePotentialScore: z.number().min(0).max(30),
      segment: z.string().describe('Specific descriptive segment label assigned by the agent'),
      reasoning: z.string(),
    }),
  }),
});

export const scoreLead = tool({
  description: 'Score a lead and assign a descriptive segment based on their profile and research.',
  inputSchema: z.object({
    leadId: z.string(),
    company: z.string(),
    country: z.string(),
    industry: z.string(),
    icpFit: z.boolean().optional(),
    icpReasoning: z.string().optional(),
    signals: z.array(z.object({ type: z.string(), source: z.string(), value: z.string() })).optional(),
  }),
  execute: async ({ leadId, company, country, industry, icpFit, icpReasoning, signals: leadSignals }, { abortSignal }) => {
    const signalSummary = (leadSignals ?? []).map(s => `- ${s.type}: ${s.value} (source: ${s.source})`).join('\n');

    const result = await scoringAgent.generate({
      abortSignal,
      prompt: `Score this lead for Onboard's GTM pipeline:

Company: ${company}
Country: ${country}
Industry: ${industry}
ICP Fit Assessment: ${icpFit ? 'Yes' : 'No'}${icpReasoning ? ` — ${icpReasoning}` : ''}
Detected Signals:
${signalSummary || 'None detected yet'}`,
    });

    if (result.output) {
      await db
        .update(leads)
        .set({
          score: result.output.totalScore,
          segment: result.output.segment,
          state: 'scored',
          stateChangedAt: new Date(),
        })
        .where(eq(leads.id, leadId));

      return {
        score: result.output.totalScore,
        segment: result.output.segment,
        breakdown: {
          icpFit: result.output.icpFitScore,
          signalStrength: result.output.signalStrengthScore,
          volumePotential: result.output.volumePotentialScore,
        },
        reasoning: result.output.reasoning,
      };
    }

    return { score: 0, segment: null, error: 'Scoring failed' };
  },
});
