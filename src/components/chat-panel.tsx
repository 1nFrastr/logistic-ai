"use client";

import { useChat } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import { History, LoaderCircle, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DynamicChart } from "@/components/dynamic-chart";
import { Explainability } from "@/components/explainability";
import type { AnalyticsResult } from "@/lib/analytics";
import type { ForecastResult } from "@/lib/forecast";

const SUGGESTIONS = [
  "Show delayed orders by week for the last 3 months",
  "Which carrier has the highest delay rate?",
  "How many orders were delivered late last month?",
  "Predict demand for PAPER for the next 4 months",
  "How much inventory should I plan for CRAYON?",
];

const HISTORY_KEY = "logistic-ai-query-history";
const historyListeners = new Set<() => void>();

function readHistory(): string {
  try {
    return localStorage.getItem(HISTORY_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function writeHistory(items: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  historyListeners.forEach((listener) => listener());
}

function subscribeHistory(onChange: () => void) {
  historyListeners.add(onChange);
  return () => {
    historyListeners.delete(onChange);
  };
}

type ToolResult = AnalyticsResult | ForecastResult;

function asToolResult(output: unknown): ToolResult | null {
  if (!output || typeof output !== "object") return null;
  if ("answer" in output && "explain" in output && "table" in output) {
    return output as ToolResult;
  }
  return null;
}

export function ChatPanel() {
  const [input, setInput] = useState("");
  const historyRaw = useSyncExternalStore(subscribeHistory, readHistory, () => "[]");
  const history = useMemo(() => {
    try {
      return JSON.parse(historyRaw) as string[];
    } catch {
      return [];
    }
  }, [historyRaw]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, setMessages } = useChat();
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const ask = (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const nextHistory = [question, ...history.filter((item) => item !== question)].slice(0, 12);
    writeHistory(nextHistory);
    sendMessage({ text: question });
    setInput("");
  };

  const empty = messages.length === 0;

  const historyOptions = useMemo(() => history.slice(0, 8), [history]);

  return (
    <aside className="flex h-full min-h-[540px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-slate-100">
            <Sparkles className="h-4 w-4 text-sky-300" />
            Ask the data
          </p>
          <p className="text-xs text-slate-500">AI routes questions to query and forecast tools</p>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-300"
            onClick={() => setMessages([])}
          >
            Clear
          </button>
        ) : null}
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Numbers always come from computed tools, never from the model. Try a question:
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200 hover:border-sky-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "ml-8" : "mr-2"}>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
              {message.role === "user" ? "You" : "Analyst"}
            </p>
            <div
              className={`rounded-2xl px-3 py-2 text-sm ${
                message.role === "user"
                  ? "bg-sky-500/15 text-sky-50"
                  : "bg-slate-900 text-slate-200"
              }`}
            >
              {message.parts.map((part, index) => {
                if (part.type === "text" && part.text.trim()) {
                  return (
                    <p key={`${message.id}-${index}`} className="whitespace-pre-wrap">
                      {part.text}
                    </p>
                  );
                }
                if (isToolUIPart(part)) {
                  const name = part.type.replace("tool-", "");
                  if (part.state !== "output-available") {
                    return (
                      <p key={`${message.id}-${index}`} className="flex items-center gap-2 text-xs text-slate-400">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        Running {name}…
                      </p>
                    );
                  }
                  const result = asToolResult(part.output);
                  if (!result) {
                    return (
                      <pre key={`${message.id}-${index}`} className="overflow-x-auto text-[11px] text-slate-400">
                        {JSON.stringify(part.output, null, 2)}
                      </pre>
                    );
                  }
                  return (
                    <div key={`${message.id}-${index}`} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-sky-300">{name}</p>
                      <p>{result.answer}</p>
                      {result.chart ? <DynamicChart chart={result.chart} height={220} /> : null}
                      <Explainability result={result} />
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {busy ? (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Interpreting and computing…
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-rose-900 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
            {error.message || "The AI gateway request failed. Set AI_GATEWAY_API_KEY and retry."}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-slate-800 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
      >
        {historyOptions.length > 0 ? (
          <div className="mb-2 flex items-center gap-2 overflow-x-auto">
            <History className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            {historyOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => ask(item)}
                className="shrink-0 rounded-full bg-slate-900 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
              >
                {item.length > 42 ? `${item.slice(0, 42)}…` : item}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            rows={2}
            placeholder="Ask about delays, carriers, SKUs, or inventory…"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                ask(input);
              }
            }}
            className="min-h-[56px] flex-1 resize-none rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-700"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-slate-950 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}
