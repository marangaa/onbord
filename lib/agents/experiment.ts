import { ToolLoopAgent, tool, Output } from 'ai';
import { z } from 'zod';
import { model } from '@/lib/ai/model';
import { db } from '@/lib/db';
import { experiments, campaigns, templates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const experimentAgent = new ToolLoopAgent({
  model,
  instructions: `You are the Experiment Agent for Onboard GTM. You analyze campaign results and propose A/B tests.

When given campaign metrics:
1. Identify the most impactful variable to test (subject line, CTA, body length, timing)
2. Propose a clear A/B test with specific variants
3. Estimate the expected impact
4. Recommend a winner based on confidence

Focus on variables that move: open rate, reply rate, and meeting bookings.`,
  output: Output.object({
    schema: z.object({
      metricTarget: z.string(),
      variantA: z.string(),
      variantB: z.string(),
      hypothesis: z.string(),
      expectedImpact: z.string(),
      recommendation: z.string(),
    }),
  }),
});

export const proposeExperiment = tool({
  description: 'Analyze campaign data and propose an A/B test experiment.',
  inputSchema: z.object({
    campaignId: z.string().describe('The campaign to analyze'),
    context: z.string().optional().describe('Additional context about performance'),
  }),
  execute: async ({ campaignId, context }, { abortSignal }) => {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) return { error: `Campaign ${campaignId} not found` };

    const campaignTemplates = await db
      .select()
      .from(templates)
      .where(eq(templates.campaignId, campaignId));

    const prompt = `Analyze this campaign and propose an A/B test:

Campaign: ${campaign.name}
Segment: ${campaign.segment}
Current subject A: ${campaign.subjectLineA}
Current subject B: ${campaign.subjectLineB}
CTA: ${campaign.cta}
Metrics: ${JSON.stringify(campaign.metrics)}
Templates: ${campaignTemplates.length} variants
${context ? `Context: ${context}` : ''}

What should we test next? Propose one experiment with a clear hypothesis.`;

    const result = await experimentAgent.generate({ prompt, abortSignal });

    if (result.output) {
      const { metricTarget, variantA, variantB, hypothesis, expectedImpact, recommendation } = result.output;

      const templateA = campaignTemplates.find(t => t.variant === 'a');
      if (templateA) {
        await db.insert(experiments).values({
          campaignId,
          templateId: templateA.id,
          variant: 'a',
          metricTarget,
          results: { variantA, variantB, hypothesis },
        });
      }

      return {
        metricTarget,
        variantA,
        variantB,
        hypothesis,
        expectedImpact,
        recommendation,
      };
    }

    return { error: 'Experiment proposal failed' };
  },
});
