import {
  convertToModelMessages,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import { AI_MAX_STEPS, AI_MODEL, AI_TEMPERATURE } from "@/lib/ai/config";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { analyticsTools } from "@/lib/ai/tools";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL) {
    return new Response(
      "Missing AI_GATEWAY_API_KEY. Add it in .env.local for local use, or configure Vercel AI Gateway on the deployed project.",
      { status: 401 },
    );
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: AI_MODEL,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: analyticsTools,
    stopWhen: isStepCount(AI_MAX_STEPS),
    temperature: AI_TEMPERATURE,
  });

  return result.toUIMessageStreamResponse();
}
