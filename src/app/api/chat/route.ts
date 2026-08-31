import {
  convertToModelMessages,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { analyticsTools } from "@/lib/ai/tools";

export const maxDuration = 60;

const MODEL = "deepseek/deepseek-v4-flash";

export async function POST(req: Request) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL) {
    return new Response(
      "Missing AI_GATEWAY_API_KEY. Add it in .env.local for local use, or configure Vercel AI Gateway on the deployed project.",
      { status: 401 },
    );
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: MODEL,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: analyticsTools,
    stopWhen: isStepCount(5),
    temperature: 0.2,
  });

  return result.toUIMessageStreamResponse();
}
