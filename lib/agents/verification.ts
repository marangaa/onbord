import { ToolLoopAgent, tool, Output } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { ilike } from 'drizzle-orm';
import { model } from '@/lib/ai/model';

const verifyAgent = new ToolLoopAgent({
  model,
  instructions: `Verify incoming lead data. Check: duplicates, data quality, completeness.
If fields are missing, list them. If data is obviously fake or malformed, flag it.
Never fabricate missing data — report what's missing and let the user provide it.`,
  output: Output.object({
    schema: z.object({
      isDuplicate: z.boolean(),
      isComplete: z.boolean(),
      isClean: z.boolean(),
      duplicateOf: z.string().optional(),
      missingFields: z.array(z.string()),
      issues: z.array(z.string()),
      normalized: z
        .object({ company: z.string(), country: z.string(), industry: z.string(), contactName: z.string().optional(), contactRole: z.string().optional(), contactEmail: z.string().optional() })
        .optional(),
    }),
  }),
});

export const verifyLead = tool({
  description:
    'Verify a lead before adding to the pipeline. Checks duplicates, completeness, and data quality. Returns what is missing if incomplete.',
  inputSchema: z.object({
    company: z.string().optional(),
    country: z.string().optional(),
    industry: z.string().optional(),
    contactName: z.string().optional(),
    contactRole: z.string().optional(),
    contactEmail: z.string().optional(),
  }),
  execute: async (input, { abortSignal }) => {
    const { company, country, industry, contactName, contactRole, contactEmail } = input;

    if (!company || company.trim().length < 2) {
      return {
        isDuplicate: false, isComplete: false, isClean: false,
        missingFields: ['company'], issues: ['Company name required'],
      };
    }

    const existing = await db
      .select({ id: leads.id, company: leads.company })
      .from(leads)
      .where(ilike(leads.company, company.trim()))
      .limit(1);

    if (existing.length > 0) {
      return {
        isDuplicate: true, isComplete: true, isClean: false,
        duplicateOf: existing[0].id,
        missingFields: [],
        issues: [`Duplicate of "${existing[0].company}"`],
      };
    }

    const missing: string[] = [];
    if (!country || country.trim().length < 2) missing.push('country');
    if (!industry || industry.trim().length < 2) missing.push('industry');
    if (!contactName || contactName.trim().length < 2) missing.push('contactName');

    if (missing.length > 0) {
      return {
        isDuplicate: false, isComplete: false, isClean: true,
        missingFields: missing,
        issues: missing.map(f => `Missing ${f}`),
        normalized: {
          company: company.trim(),
          country: (country ?? '').trim(),
          industry: (industry ?? '').trim(),
          contactName: (contactName ?? '').trim(),
          contactRole: (contactRole ?? '').trim(),
          contactEmail: (contactEmail ?? '').trim(),
        },
      };
    }

    const prompt = `Quick quality check:
Company: ${company}
Country: ${country}
Industry: ${industry}
Contact: ${contactName} (${contactRole ?? 'unknown'})

Is anything obviously wrong? Fake data? Mismatched industry/country? Return clean unless there's a clear issue.`;

    const result = await verifyAgent.generate({ prompt, abortSignal });
    return { ...(result.output ?? { isDuplicate: false, isComplete: true, isClean: true, missingFields: [], issues: [] }), normalized: { company: company.trim(), country: (country??'').trim(), industry: (industry??'').trim(), contactName: (contactName??'').trim(), contactRole: (contactRole??'').trim(), contactEmail: (contactEmail??'').trim() } };
  },
});
