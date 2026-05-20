import { gtmOrchestrator } from '@/lib/agents/orchestrator';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: gtmOrchestrator,
    uiMessages: messages,
  });
}
