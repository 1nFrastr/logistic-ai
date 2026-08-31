import type { EvalCase } from "./score";

export const EVAL_CASES: EvalCase[] = [
  {
    id: "delay-rate-by-carrier",
    prompt: "Which carrier has the highest delay rate?",
    notes: "Spec diagnostic example. Completed-shipment delay rate, ranked by carrier.",
    expect: {
      tools: ["queryAnalytics"],
      firstTool: "queryAnalytics",
      call: {
        tool: "queryAnalytics",
        input: { metric: "delay_rate", groupBy: "carrier" },
      },
      textIncludes: ["GLS"],
      toolAnswerIncludes: ["GLS"],
    },
  },
  {
    id: "delayed-by-week-last-3m",
    prompt: "Show delayed orders by week for the last 3 months",
    notes: "Spec example. Either delayed_orders or delayedOnly, grouped by week.",
    expect: {
      tools: ["queryAnalytics"],
      anyCall: [
        {
          tool: "queryAnalytics",
          input: { metric: "delayed_orders", groupBy: "week", timeRange: "last_3_months" },
        },
        {
          tool: "queryAnalytics",
          input: { delayedOnly: true, groupBy: "week", timeRange: "last_3_months" },
        },
        {
          tool: "queryAnalytics",
          input: { metric: "orders", status: "delayed", groupBy: "week", timeRange: "last_3_months" },
        },
      ],
    },
  },
  {
    id: "late-last-month",
    prompt: "How many orders were delivered late last month?",
    notes: "As-of date is 2025-12-30, so last_month is November 2025.",
    expect: {
      tools: ["queryAnalytics"],
      anyCall: [
        { tool: "queryAnalytics", input: { metric: "delayed_orders", timeRange: "last_month" } },
        { tool: "queryAnalytics", input: { delayedOnly: true, timeRange: "last_month" } },
        { tool: "queryAnalytics", input: { status: "delayed", timeRange: "last_month" } },
      ],
    },
  },
  {
    id: "paper-demand-4m",
    prompt: "Predict demand for PAPER for the next 4 months",
    notes: "Demand/inventory must resolve to quantity (units), not order count.",
    expect: {
      tools: ["forecastDemand"],
      firstTool: "forecastDemand",
      call: {
        tool: "forecastDemand",
        input: {
          dimension: "category",
          key: "PAPER",
          metric: { oneOf: [undefined, "quantity"] },
          horizonMonths: { oneOf: [undefined, 4] },
        },
      },
      forecastMetric: "quantity",
    },
  },
  {
    id: "crayon-inventory",
    prompt: "How much inventory should I plan for CRAYON?",
    notes: "Prescriptive inventory question from the spec.",
    expect: {
      tools: ["forecastDemand"],
      call: {
        tool: "forecastDemand",
        input: {
          dimension: "category",
          key: "CRAYON",
          metric: { oneOf: [undefined, "quantity"] },
        },
      },
      forecastMetric: "quantity",
    },
  },
  {
    id: "paper-order-count-forecast",
    prompt: "How many PAPER orders should I expect over the next 4 months?",
    notes: "Control case: explicit order-count wording may use metric=orders.",
    expect: {
      tools: ["forecastDemand"],
      call: {
        tool: "forecastDemand",
        input: {
          dimension: "category",
          key: "PAPER",
          horizonMonths: { oneOf: [undefined, 4] },
        },
      },
    },
  },
  {
    id: "total-orders",
    prompt: "How many orders are in the dataset?",
    expect: {
      tools: ["queryAnalytics"],
      call: {
        tool: "queryAnalytics",
        input: { metric: "orders", groupBy: { oneOf: [undefined, "none"] } },
      },
      textIncludes: ["400"],
    },
  },
  {
    id: "revenue-by-region",
    prompt: "Which region has the highest revenue?",
    expect: {
      tools: ["queryAnalytics"],
      call: {
        tool: "queryAnalytics",
        input: { metric: "revenue", groupBy: "region" },
      },
    },
  },
  {
    id: "unknown-sku-forecast",
    prompt: "Predict demand for SKU FAKE-9999 for the next 4 months",
    notes: "Should still call the tool; unknown SKU surfaces as a warning, not invented history.",
    expect: {
      tools: ["forecastDemand"],
      call: {
        tool: "forecastDemand",
        input: { dimension: "sku", key: { includes: "FAKE" } },
      },
    },
  },
];
