import { createMem0 } from '@mem0/vercel-ai-provider';

const mem0ApiKey = process.env.MEM0_API_KEY;
const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

let mem0: ReturnType<typeof createMem0> | null = null;

export function getMemoryModel(modelId: string, userId: string) {
  if (!mem0ApiKey || !googleApiKey) return null;

  if (!mem0) {
    mem0 = createMem0({
      provider: 'google',
      mem0ApiKey,
      apiKey: googleApiKey,
    });
  }

  return mem0(modelId, { user_id: userId });
}

export function hasMemory(): boolean {
  return !!mem0ApiKey && !!googleApiKey;
}
