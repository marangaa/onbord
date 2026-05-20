import { ToolLoopAgent, tool, Output } from 'ai';
import { z } from 'zod';
import { model } from '@/lib/ai/model';
import { db } from '@/lib/db';
import { campaigns, templates } from '@/lib/db/schema';

const campaignAgent = new ToolLoopAgent({
  model,
  instructions: `You are the Campaign Agent for Onboard GTM. Generate outreach campaigns tailored to specific ICP segments.

For each campaign, create:
- Two subject line variants for A/B testing
- An email body using {{company}}, {{contact}}, and {{signal}} as dynamic variables
- A clear, single call to action

Adapt messaging to the segment's typical cross-border payment challenges. Be specific and commercially sharp.`,
  output: Output.object({
    schema: z.object({
      name: z.string(),
      segment: z.string(),
      subjectLineA: z.string(),
      subjectLineB: z.string(),
      cta: z.string(),
      body: z.string(),
      reasoning: z.string(),
    }),
  }),
});

export const generateCampaign = tool({
  description: 'Generate a new outreach campaign for a target segment.',
  inputSchema: z.object({
    segment: z.string().describe('The target segment or ICP description'),
    context: z.string().optional().describe('Additional context about what to emphasize'),
  }),
  execute: async ({ segment, context }, { abortSignal }) => {
    const result = await campaignAgent.generate({
      abortSignal,
      prompt: `Generate an outreach campaign for: ${segment}.${context ? ` Context: ${context}` : ''}`,
    });

    if (result.output) {
      const { name, subjectLineA, subjectLineB, cta, body, reasoning } = result.output;
      const [campaign] = await db.insert(campaigns).values({ name, segment, subjectLineA, subjectLineB, cta }).returning();
      await db.insert(templates).values([
        { campaignId: campaign.id, variant: 'a', body },
        { campaignId: campaign.id, variant: 'b', body },
      ]);
      return { campaignId: campaign.id, name, segment, subjectLineA, subjectLineB, cta, reasoning };
    }

    return { error: 'Campaign generation failed' };
  },
});
