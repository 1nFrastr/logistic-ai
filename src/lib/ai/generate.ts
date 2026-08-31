import { generateText, isStepCount } from "ai";
import { AI_MAX_STEPS, AI_MODEL, AI_TEMPERATURE } from "@/lib/ai/config";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { analyticsTools } from "@/lib/ai/tools";

export async function runAnalystPrompt(prompt: string) {
  return generateText({
    model: AI_MODEL,
    system: SYSTEM_PROMPT,
    prompt,
    tools: analyticsTools,
    stopWhen: isStepCount(AI_MAX_STEPS),
    temperature: AI_TEMPERATURE,
  });
}
