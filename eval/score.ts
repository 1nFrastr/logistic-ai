export type ToolName = "queryAnalytics" | "forecastDemand";

export type FieldExpect =
  | string
  | number
  | boolean
  | {
      eq?: string | number | boolean | null;
      oneOf?: Array<string | number | boolean | null | undefined>;
      includes?: string;
      absent?: boolean;
    };

export type CallExpect = {
  tool: ToolName;
  input?: Record<string, FieldExpect>;
};

export type EvalCase = {
  id: string;
  prompt: string;
  notes?: string;
  expect: {
    /** Every listed tool must be called at least once. */
    tools?: ToolName[];
    firstTool?: ToolName;
    /** At least one recorded call must match this shape. */
    call?: CallExpect;
    /** Pass if any of these call shapes match (OR). */
    anyCall?: CallExpect[];
    /** After the tool runs, forecastDemand's resolved metric (default quantity). */
    forecastMetric?: "orders" | "quantity" | "revenue";
    textIncludes?: string[];
    textExcludes?: string[];
    toolAnswerIncludes?: string[];
  };
};

export type RecordedCall = {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
};

export type Check = {
  name: string;
  pass: boolean;
  detail: string;
  severity: "fail" | "warn";
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fieldValue(input: Record<string, unknown>, key: string): unknown {
  return input[key];
}

function matchField(actual: unknown, expected: FieldExpect, key: string): Check {
  if (typeof expected === "string" || typeof expected === "number" || typeof expected === "boolean") {
    const pass =
      typeof actual === "string" && typeof expected === "string"
        ? actual.toLowerCase() === expected.toLowerCase()
        : actual === expected;
    return {
      name: `input.${key}`,
      pass,
      detail: pass ? `${key}=${JSON.stringify(actual)}` : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      severity: "fail",
    };
  }

  if (expected.absent) {
    const pass = actual === undefined || actual === null;
    return {
      name: `input.${key}`,
      pass,
      detail: pass ? `${key} omitted` : `expected ${key} absent, got ${JSON.stringify(actual)}`,
      severity: "fail",
    };
  }

  if (expected.oneOf) {
    const pass = expected.oneOf.some((candidate) => {
      if (candidate === undefined) return actual === undefined || actual === null;
      if (typeof candidate === "string" && typeof actual === "string") {
        return candidate.toLowerCase() === actual.toLowerCase();
      }
      return candidate === actual;
    });
    return {
      name: `input.${key}`,
      pass,
      detail: pass
        ? `${key}=${JSON.stringify(actual)}`
        : `expected ${key} in ${JSON.stringify(expected.oneOf)}, got ${JSON.stringify(actual)}`,
      severity: "fail",
    };
  }

  if (expected.includes !== undefined) {
    const pass = typeof actual === "string" && actual.toLowerCase().includes(expected.includes.toLowerCase());
    return {
      name: `input.${key}`,
      pass,
      detail: pass ? `${key} includes ${expected.includes}` : `${JSON.stringify(actual)} does not include ${expected.includes}`,
      severity: "fail",
    };
  }

  if ("eq" in expected) {
    const pass =
      typeof actual === "string" && typeof expected.eq === "string"
        ? actual.toLowerCase() === expected.eq.toLowerCase()
        : actual === expected.eq;
    return {
      name: `input.${key}`,
      pass,
      detail: pass ? `${key}=${JSON.stringify(actual)}` : `expected ${JSON.stringify(expected.eq)}, got ${JSON.stringify(actual)}`,
      severity: "fail",
    };
  }

  return { name: `input.${key}`, pass: true, detail: "skipped", severity: "fail" };
}

function matchCall(call: RecordedCall, expected: CallExpect): Check[] {
  const checks: Check[] = [
    {
      name: `tool:${expected.tool}`,
      pass: call.tool === expected.tool,
      detail: `called ${call.tool}`,
      severity: "fail",
    },
  ];
  if (call.tool !== expected.tool) return checks;
  for (const [key, spec] of Object.entries(expected.input ?? {})) {
    checks.push(matchField(fieldValue(call.input, key), spec, key));
  }
  return checks;
}

function toolAnswer(output: unknown): string {
  const record = asRecord(output);
  return typeof record.answer === "string" ? record.answer : "";
}

function forecastMetricOf(calls: RecordedCall[]): string | null {
  const call = calls.find((item) => item.tool === "forecastDemand");
  if (!call) return null;
  const output = asRecord(call.output);
  const explain = asRecord(output.explain);
  const queryPlan = asRecord(explain.queryPlan);
  if (typeof queryPlan.metric === "string") return queryPlan.metric;
  const metrics = explain.metrics;
  if (Array.isArray(metrics) && typeof metrics[0] === "string") return metrics[0];
  return null;
}

function collectHaystack(calls: RecordedCall[], text: string): string {
  const chunks = [text];
  for (const call of calls) {
    chunks.push(JSON.stringify(call.input));
    const output = asRecord(call.output);
    chunks.push(toolAnswer(output));
    chunks.push(JSON.stringify(output.inventory ?? null));
    chunks.push(JSON.stringify(asRecord(output.explain).queryPlan ?? null));
    chunks.push(JSON.stringify(output.table ?? null));
    chunks.push(JSON.stringify(output.warnings ?? null));
  }
  return chunks.join("\n").toLowerCase();
}

function faithfulnessChecks(calls: RecordedCall[], text: string): Check[] {
  if (!text.trim() || calls.length === 0) return [];
  const haystack = collectHaystack(calls, "");
  const tokens = text.match(/\d+(?:\.\d+)?%?/g) ?? [];
  const invented: string[] = [];
  for (const token of tokens) {
    const bare = token.replace(/%$/, "");
    if (bare === "2025" || bare === "2026") continue;
    const needle = bare.toLowerCase();
    if (haystack.includes(needle)) continue;
    const asNumber = Number(bare);
    if (!Number.isNaN(asNumber) && haystack.includes(String(Math.round(asNumber)))) continue;
    invented.push(token);
  }
  if (invented.length === 0) {
    return [{ name: "faithfulness", pass: true, detail: "prose numbers appear in tool output", severity: "warn" }];
  }
  return [
    {
      name: "faithfulness",
      pass: false,
      detail: `prose has numbers not in tool output: ${invented.join(", ")}`,
      severity: "warn",
    },
  ];
}

export function scoreCase(testCase: EvalCase, calls: RecordedCall[], text: string): Check[] {
  const checks: Check[] = [];
  const { expect } = testCase;

  if (expect.tools) {
    for (const tool of expect.tools) {
      const pass = calls.some((call) => call.tool === tool);
      checks.push({
        name: `called:${tool}`,
        pass,
        detail: pass ? "yes" : `tools used: ${calls.map((call) => call.tool).join(", ") || "(none)"}`,
        severity: "fail",
      });
    }
  }

  if (expect.firstTool) {
    const actual = calls[0]?.tool;
    checks.push({
      name: "firstTool",
      pass: actual === expect.firstTool,
      detail: actual ? `first tool ${actual}` : "no tool call",
      severity: "fail",
    });
  }

  if (expect.call) {
    const matched = calls.find((call) => matchCall(call, expect.call!).every((check) => check.pass));
    if (matched) {
      checks.push(...matchCall(matched, expect.call));
    } else {
      checks.push({
        name: `call:${expect.call.tool}`,
        pass: false,
        detail: `no matching ${expect.call.tool} call. recorded: ${JSON.stringify(calls.map((call) => ({ tool: call.tool, input: call.input })))}`,
        severity: "fail",
      });
    }
  }

  if (expect.anyCall && expect.anyCall.length > 0) {
    const hit = expect.anyCall.find((candidate) =>
      calls.some((call) => matchCall(call, candidate).every((check) => check.pass)),
    );
    checks.push({
      name: "anyCall",
      pass: Boolean(hit),
      detail: hit
        ? `matched ${hit.tool} ${JSON.stringify(hit.input ?? {})}`
        : `none of ${expect.anyCall.length} accepted shapes matched`,
      severity: "fail",
    });
  }

  if (expect.forecastMetric) {
    const actual = forecastMetricOf(calls);
    checks.push({
      name: "forecastMetric",
      pass: actual === expect.forecastMetric,
      detail: actual
        ? `resolved metric=${actual}`
        : "forecastDemand did not return a metric",
      severity: "fail",
    });
  }

  const combinedAnswers = calls.map((call) => toolAnswer(call.output)).join("\n");
  for (const needle of expect.textIncludes ?? []) {
    const pass = text.toLowerCase().includes(needle.toLowerCase());
    checks.push({
      name: `textIncludes:${needle}`,
      pass,
      detail: pass ? "found" : "missing from model summary",
      severity: "fail",
    });
  }
  for (const needle of expect.textExcludes ?? []) {
    const pass = !text.toLowerCase().includes(needle.toLowerCase());
    checks.push({
      name: `textExcludes:${needle}`,
      pass,
      detail: pass ? "absent" : "unexpectedly present in model summary",
      severity: "fail",
    });
  }
  for (const needle of expect.toolAnswerIncludes ?? []) {
    const pass = combinedAnswers.toLowerCase().includes(needle.toLowerCase());
    checks.push({
      name: `toolAnswerIncludes:${needle}`,
      pass,
      detail: pass ? "found" : "missing from tool answer",
      severity: "fail",
    });
  }

  checks.push(...faithfulnessChecks(calls, text));
  return checks;
}

export function compactOutput(output: unknown): Record<string, unknown> {
  const record = asRecord(output);
  return {
    answer: record.answer ?? null,
    warnings: record.warnings ?? [],
    inventory: record.inventory ?? null,
    methodology: record.methodology ?? null,
    explain: record.explain ?? null,
    table: record.table ?? null,
  };
}
