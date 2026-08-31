import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AI_MODEL } from "@/lib/ai/config";
import { runAnalystPrompt } from "@/lib/ai/generate";
import { EVAL_CASES } from "./cases";
import { compactOutput, scoreCase, type Check, type EvalCase, type RecordedCall } from "./score";

type CliOptions = {
  ids: string[];
  prompt: string | null;
  list: boolean;
  help: boolean;
};

type CaseTrace = {
  id: string;
  prompt: string;
  notes?: string;
  pass: boolean;
  failed: string[];
  warned: string[];
  checks: Check[];
  text: string;
  calls: Array<{ tool: string; input: Record<string, unknown>; output: Record<string, unknown> }>;
  usage: unknown;
  error?: string;
  elapsedMs: number;
};

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cleaned = line.startsWith("export ") ? line.slice(7) : line;
    const eq = cleaned.indexOf("=");
    if (eq < 1) continue;
    const key = cleaned.slice(0, eq).trim();
    let value = cleaned.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const ids: string[] = [];
  let prompt: string | null = null;
  let list = false;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") list = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--id" && argv[i + 1]) {
      ids.push(...argv[i + 1].split(",").map((item) => item.trim()).filter(Boolean));
      i += 1;
    } else if (arg.startsWith("--id=")) {
      ids.push(...arg.slice(5).split(",").map((item) => item.trim()).filter(Boolean));
    } else if (arg === "--prompt" && argv[i + 1]) {
      prompt = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--prompt=")) {
      prompt = arg.slice(9);
    } else if (!arg.startsWith("-")) {
      ids.push(arg);
    }
  }
  return { ids, prompt, list, help };
}

function printHelp() {
  console.log(`Usage:
  pnpm eval                     Run all cases
  pnpm eval -- --list           List case ids
  pnpm eval -- --id paper-demand-4m
  pnpm eval -- --prompt "Predict demand for PAPER for the next 4 months"

Talks to ${AI_MODEL} with the same system prompt and tools as POST /api/chat.
Writes traces to eval/results/<timestamp>.json
`);
}

function recordedCallsFromResult(result: Awaited<ReturnType<typeof runAnalystPrompt>>): RecordedCall[] {
  return result.toolResults.map((item) => ({
    tool: item.toolName,
    input: (item.input ?? {}) as Record<string, unknown>,
    output: item.output,
  }));
}

function formatChecks(checks: Check[]): string {
  return checks
    .map((check) => {
      const mark = check.pass ? "ok" : check.severity === "warn" ? "warn" : "FAIL";
      return `    [${mark}] ${check.name} — ${check.detail}`;
    })
    .join("\n");
}

async function runOne(testCase: EvalCase): Promise<CaseTrace> {
  const started = Date.now();
  try {
    const result = await runAnalystPrompt(testCase.prompt);
    const calls = recordedCallsFromResult(result);
    const checks = scoreCase(testCase, calls, result.text);
    const failed = checks.filter((check) => !check.pass && check.severity === "fail").map((check) => check.name);
    const warned = checks.filter((check) => !check.pass && check.severity === "warn").map((check) => check.name);
    return {
      id: testCase.id,
      prompt: testCase.prompt,
      notes: testCase.notes,
      pass: failed.length === 0,
      failed,
      warned,
      checks,
      text: result.text,
      calls: calls.map((call) => ({
        tool: call.tool,
        input: call.input,
        output: compactOutput(call.output),
      })),
      usage: result.usage,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      id: testCase.id,
      prompt: testCase.prompt,
      notes: testCase.notes,
      pass: false,
      failed: ["runtime"],
      warned: [],
      checks: [
        {
          name: "runtime",
          pass: false,
          detail: error instanceof Error ? error.message : String(error),
          severity: "fail",
        },
      ],
      text: "",
      calls: [],
      usage: null,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    };
  }
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.list) {
    for (const testCase of EVAL_CASES) {
      console.log(`${testCase.id}\n  ${testCase.prompt}`);
    }
    return;
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL) {
    console.error("Missing AI_GATEWAY_API_KEY. Set it in .env.local before running pnpm eval.");
    process.exitCode = 1;
    return;
  }

  const selected: EvalCase[] = options.prompt
    ? [{ id: "adhoc", prompt: options.prompt, expect: {} }]
    : EVAL_CASES.filter((testCase) => options.ids.length === 0 || options.ids.includes(testCase.id));

  if (selected.length === 0) {
    console.error(`No cases matched. Known ids: ${EVAL_CASES.map((item) => item.id).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Model ${AI_MODEL} · ${selected.length} case(s)\n`);
  const traces: CaseTrace[] = [];
  for (const testCase of selected) {
    process.stdout.write(`→ ${testCase.id} … `);
    const trace = await runOne(testCase);
    traces.push(trace);
    const status = trace.pass ? "PASS" : "FAIL";
    const extra = trace.warned.length ? ` (${trace.warned.length} warn)` : "";
    console.log(`${status}${extra}  ${trace.elapsedMs}ms`);
    console.log(formatChecks(trace.checks));
    if (trace.text) {
      const preview = trace.text.replace(/\s+/g, " ").slice(0, 280);
      console.log(`    summary: ${preview}${trace.text.length > 280 ? "…" : ""}`);
    }
    console.log("");
  }

  const passed = traces.filter((item) => item.pass).length;
  const failed = traces.length - passed;
  const outDir = resolve(process.cwd(), "eval/results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = resolve(outDir, `${stamp}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        model: AI_MODEL,
        at: new Date().toISOString(),
        passed,
        failed,
        traces,
      },
      null,
      2,
    ),
  );

  console.log(`${passed} passed, ${failed} failed`);
  console.log(`wrote ${outFile}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
