import { ToolLoopAgent, tool, Output } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { events as eventTable } from '@/lib/db/schema';
import { model } from '@/lib/ai/model';

const sequenceAgent = new ToolLoopAgent({
  model,
  instructions: `You decide the next action in an outreach sequence. Based on the lead's profile, score, past engagement, and current step, determine whether to send the next message, wait, skip, or escalate to a human. Consider timing, engagement patterns, and lead quality. Explain your reasoning.`,
  output: Output.object({
    schema: z.object({
      action: z.enum(['send_now', 'wait', 'skip', 'escalate']),
      reason: z.string(),
      waitDays: z.number().optional(),
      nextTemplateVariant: z.enum(['a', 'b']).optional(),
    }),
  }),
});

export const decideNextStep = tool({
  description: 'Decide the next outreach action for a lead based on their profile and engagement.',
  inputSchema: z.object({
    leadId: z.string(),
    company: z.string(),
    score: z.number(),
    segment: z.string().optional(),
    currentStep: z.number(),
    lastEvents: z.array(z.object({
      type: z.enum(['opened', 'clicked', 'replied', 'bounced']),
      occurredAt: z.string(),
      campaignStep: z.number(),
    })).optional(),
  }),
  execute: async ({ leadId, company, score, segment, currentStep, lastEvents }, { abortSignal }) => {
    const eventSummary = (lastEvents ?? []).map(e => `${e.type} at step ${e.campaignStep} on ${e.occurredAt}`).join('; ');

    const result = await sequenceAgent.generate({
      abortSignal,
      prompt: `Decide the next outreach action:

Lead: ${company}
Score: ${score}/100
Segment: ${segment ?? 'unknown'}
Current step: ${currentStep}
Recent events: ${eventSummary || 'none'}

Consider engagement level, score, and how many touches have been made. Return your decision with reasoning.`,
    });

    if (result.output) {
      await db.insert(eventTable).values({ leadId, type: 'opened', campaignStep: currentStep + 1 });
      return result.output;
    }

    return { action: 'send_now' as const, reason: 'Default: proceed to next step' };
  },
});
