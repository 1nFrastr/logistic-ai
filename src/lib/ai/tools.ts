import { tool } from "ai";
import { z } from "zod";
import { runAnalyticsQuery } from "@/lib/analytics";
import { DATASET } from "@/lib/data";
import { runForecast } from "@/lib/forecast";

const timeRangeSchema = z
  .enum(["all", "last_7_days", "last_30_days", "last_month", "last_3_months", "last_6_months", "ytd", "custom"])
  .describe("Relative window resolved against dataset as-of date 2025-12-30. Prefer this over inventing dates.");

const metricSchema = z.enum([
  "orders",
  "quantity",
  "revenue",
  "delayed_orders",
  "delivered_orders",
  "delay_rate",
  "on_time_rate",
  "avg_delivery_days",
]);

const groupBySchema = z.enum([
  "none",
  "week",
  "month",
  "carrier",
  "region",
  "warehouse",
  "category",
  "destination",
  "origin",
  "status",
  "sku",
  "client",
]);

const filterFields = {
  timeRange: timeRangeSchema.optional(),
  dateFrom: z.string().optional().describe("YYYY-MM-DD, only when timeRange is custom"),
  dateTo: z.string().optional().describe("YYYY-MM-DD, only when timeRange is custom"),
  carrier: z.string().optional().describe(`One of: ${DATASET.carriers.join(", ")}`),
  region: z.string().optional().describe(`One of: ${DATASET.regions.join(", ")}`),
  warehouse: z.string().optional().describe(`One of: ${DATASET.warehouses.join(", ")}`),
  category: z.string().optional().describe(`One of: ${DATASET.categories.join(", ")}`),
  sku: z.string().optional(),
  status: z.string().optional().describe(`One of: ${DATASET.statuses.join(", ")}`),
  destination: z.string().optional().describe("Partial match on destination city"),
  delayedOnly: z.boolean().optional(),
};

export const analyticsTools = {
  queryAnalytics: tool({
    description:
      "Compute logistics KPIs, aggregations, and charts from the read-only order dataset. Use for historical / diagnostic questions.",
    inputSchema: z.object({
      metric: metricSchema.describe("Primary metric to compute and chart"),
      groupBy: groupBySchema.optional().describe("Dimension to split by. Use none for a single KPI."),
      limit: z.number().int().min(1).max(50).optional(),
      chartHint: z.enum(["auto", "bar", "line", "area", "pie"]).optional(),
      ...filterFields,
    }),
    execute: async (input) => runAnalyticsQuery(input),
  }),
  forecastDemand: tool({
    description:
      "Forecast future monthly demand and recommend inventory. Demand / stock / predict questions use quantity (shipped units). Do not pass metric=orders unless the user asked for order count.",
    inputSchema: z.object({
      dimension: z.enum(["overall", "sku", "category", "region", "warehouse"]),
      key: z.string().optional().describe("SKU, category, region, or warehouse value when dimension is not overall"),
      metric: z
        .enum(["orders", "quantity", "revenue"])
        .optional()
        .describe(
          "quantity = shipped units (default; use for demand and inventory). orders = order count (only if asked). revenue = USD.",
        ),
      horizonMonths: z.number().int().min(1).max(6).optional(),
      method: z.enum(["moving_average", "linear_regression", "exponential_smoothing"]).optional(),
      safetyStockPct: z.number().min(0).max(1).optional(),
      ...filterFields,
    }),
    execute: async (input) => runForecast(input),
  }),
};
