import { tool } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Drafts a follow-up reply for a lead who has responded to outreach.
 *
 * The agent generates the draft and saves it to the lead's meta.
 * The BD person sees it in the Inbox, edits if needed, then sends via mailto.
 * This is the HITL loop — the agent eliminates the blank-page problem,
 * the BD stays in control of what actually goes out.
 */
export const suggestReply = tool({
  description:
    'Draft a personalised follow-up reply for a lead who has replied to outreach. ' +
    'Always call this when a lead is in the Inbox and the BD team asks for a reply suggestion or next step. ' +
    'The draft is saved to the lead and shown in the Inbox for BD to review, edit, and send.',

  inputSchema: z.object({
    leadId: z.string().describe('UUID of the lead'),
    theirReply: z
      .string()
      .describe("What the lead said in their reply — from their logged note"),
    intent: z
      .string()
      .optional()
      .describe(
        'Inferred intent: e.g. "wants to book a call", "interested but needs pricing", "asking for social proof"',
      ),
    suggestedSubject: z
      .string()
      .describe('Subject line (usually Re: [original subject])'),
    suggestedBody: z
      .string()
      .describe(
        'Full body of the follow-up. Concise (3–5 sentences), acknowledges what they said specifically, moves toward a concrete next step.',
      ),
    suggestedCta: z
      .string()
      .describe('Closing ask — clear and low-friction (e.g. "Would Tuesday at 3pm work?")'),
    reasoning: z
      .string()
      .optional()
      .describe('Brief explanation of why this draft was written this way'),
  }),

  execute: async ({ leadId, suggestedSubject, suggestedBody, suggestedCta, intent, theirReply, reasoning }) => {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return { error: `Lead ${leadId} not found` };

    const existingMeta = (lead.meta as Record<string, unknown>) ?? {};

    await db
      .update(leads)
      .set({
        meta: {
          ...existingMeta,
          replyDraft: {
            at: new Date().toISOString(),
            subject: suggestedSubject,
            body: suggestedBody,
            cta: suggestedCta,
            intent: intent ?? null,
            theirReply,
            reasoning: reasoning ?? null,
          },
        },
      })
      .where(eq(leads.id, leadId));

    return {
      success: true,
      company: lead.company,
      subject: suggestedSubject,
      body: suggestedBody,
      cta: suggestedCta,
      intent: intent ?? null,
      message:
        `Reply draft saved for ${lead.company}. ` +
        `Check the Inbox — the draft is ready to review and edit before sending.`,
    };
  },
});
