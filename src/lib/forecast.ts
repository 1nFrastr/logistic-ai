import { filterOrders, type AnalyticsFilters } from "@/lib/analytics";
import { monthKey, nextMonthKey } from "@/lib/dates";
import type { ChartSpec, QueryPlan, TableRow } from "@/lib/types";

export type ForecastMethod = "moving_average" | "linear_regression" | "exponential_smoothing";
export type ForecastDimension = "overall" | "sku" | "category" | "region" | "warehouse";
export type ForecastMetric = "orders" | "quantity" | "revenue";

export type ForecastQuery = AnalyticsFilters & {
  dimension: ForecastDimension;
  key?: string | null;
  metric?: ForecastMetric;
  horizonMonths?: number;
  method?: ForecastMethod;
  safetyStockPct?: number;
};

export type ForecastResult = {
  answer: string;
  chart: ChartSpec;
  table: TableRow[];
  inventory: {
    recommendedUnits: number;
    safetyStockPct: number;
    forecastSum: number;
    rationale: string;
  };
  methodology: string;
  explain: {
    filters: Record<string, string | boolean | number | null>;
    metrics: string[];
    dimensions: string[];
    queryPlan: QueryPlan;
  };
  warnings: string[];
};

type Point = { month: string; value: number };

function movingAverage(history: number[], horizon: number, window = 3): number[] {
  const size = Math.min(window, history.length);
  const avg = history.slice(-size).reduce((sum, value) => sum + value, 0) / size;
  return Array.from({ length: horizon }, () => round(avg));
}

function linearRegression(history: number[], horizon: number): number[] {
  const n = history.length;
  const xs = history.map((_, index) => index + 1);
  const sumX = xs.reduce((sum, x) => sum + x, 0);
  const sumY = history.reduce((sum, y) => sum + y, 0);
  const sumXY = xs.reduce((sum, x, index) => sum + x * history[index], 0);
  const sumXX = xs.reduce((sum, x) => sum + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  return Array.from({ length: horizon }, (_, index) =>
    round(Math.max(0, intercept + slope * (n + index + 1))),
  );
}

function exponentialSmoothing(history: number[], horizon: number, alpha = 0.4): number[] {
  let level = history[0] ?? 0;
  for (let i = 1; i < history.length; i += 1) {
    level = alpha * history[i] + (1 - alpha) * level;
  }
  let trend = 0;
  if (history.length >= 2) {
    const recent = history.slice(-3);
    trend = (recent[recent.length - 1] - recent[0]) / Math.max(recent.length - 1, 1);
  }
  const damped = 0.6;
  return Array.from({ length: horizon }, (_, index) =>
    round(Math.max(0, level + trend * damped * (index + 1))),
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function forecastValues(method: ForecastMethod, history: number[], horizon: number): number[] {
  if (history.length === 0) return Array.from({ length: horizon }, () => 0);
  if (method === "moving_average") return movingAverage(history, horizon);
  if (method === "linear_regression") return linearRegression(history, horizon);
  return exponentialSmoothing(history, horizon);
}

function methodologyText(method: ForecastMethod): string {
  switch (method) {
    case "moving_average":
      return "3-month moving average of historical monthly values, held flat across the forecast horizon.";
    case "linear_regression":
      return "Ordinary least squares trend on monthly values, projected forward and floored at zero.";
    case "exponential_smoothing":
      return "Simple exponential smoothing (alpha = 0.4) plus a damped recent trend for the forecast horizon.";
  }
}

export function runForecast(query: ForecastQuery): ForecastResult {
  const dimension = query.dimension;
  const metric = query.metric ?? "quantity";
  const horizon = Math.min(Math.max(query.horizonMonths ?? 4, 1), 6);
  const method = query.method ?? "exponential_smoothing";
  const safetyStockPct = query.safetyStockPct ?? 0.2;

  const filters: AnalyticsFilters = {
    ...query,
    sku: dimension === "sku" ? query.key : query.sku,
    category: dimension === "category" ? query.key : query.category,
    region: dimension === "region" ? query.key : query.region,
    warehouse: dimension === "warehouse" ? query.key : query.warehouse,
    timeRange: query.timeRange ?? "all",
  };

  const { rows, from, to, rangeLabel, warnings, applied } = filterOrders(filters);

  const monthly = new Map<string, number>();
  for (const order of rows) {
    const key = monthKey(order.order_date);
    const increment =
      metric === "orders" ? 1 : metric === "revenue" ? order.order_value_usd : order.quantity;
    monthly.set(key, (monthly.get(key) ?? 0) + increment);
  }

  const historyKeys = [...monthly.keys()].sort();
  const history: Point[] = historyKeys.map((month) => ({
    month,
    value: round(monthly.get(month) ?? 0),
  }));
  const values = history.map((point) => point.value);
  const forecast = forecastValues(method, values, horizon);

  const forecastPoints: Point[] = [];
  let cursor = historyKeys[historyKeys.length - 1] ?? "2025-12";
  for (let i = 0; i < horizon; i += 1) {
    cursor = nextMonthKey(cursor);
    forecastPoints.push({ month: cursor, value: forecast[i] });
  }

  const forecastSum = round(forecast.reduce((sum, value) => sum + value, 0));
  const recommendedUnits = Math.ceil(forecastSum * (1 + safetyStockPct));
  const subject =
    dimension === "overall"
      ? "all SKUs"
      : `${dimension} ${applied.sku || applied.category || applied.region || applied.warehouse || query.key || "(unspecified)"}`;

  if (history.length < 3) {
    warnings.push(
      `Only ${history.length} historical month(s) matched this slice. Forecast uncertainty is high; consider aggregating by category.`,
    );
  }

  const chart: ChartSpec = {
    type: "line",
    title: `Demand forecast — ${subject}`,
    xKey: "month",
    xLabel: "month",
    series: [
      { key: "historical", label: "Historical" },
      { key: "forecast", label: "Forecast" },
    ],
    data: [
      ...history.map((point) => ({ month: point.month, historical: point.value, forecast: null })),
      ...forecastPoints.map((point) => ({ month: point.month, historical: null, forecast: point.value })),
    ],
  };

  const table: TableRow[] = [
    ...history.map((point) => ({ month: point.month, series: "historical", value: point.value })),
    ...forecastPoints.map((point) => ({ month: point.month, series: "forecast", value: point.value })),
  ];

  const inventory = {
    recommendedUnits,
    safetyStockPct,
    forecastSum,
    rationale: `Cover the ${horizon}-month forecasted ${metric} (${forecastSum}) plus a ${Math.round(safetyStockPct * 100)}% buffer for delay and demand variance.`,
  };

  const answer =
    rows.length === 0
      ? `No historical rows matched ${subject} in ${rangeLabel}, so the forecast is zero.`
      : `Forecasted ${metric} for ${subject} over the next ${horizon} months is ${forecastSum}. Recommended inventory to plan: ${recommendedUnits} units.`;

  const queryPlan: QueryPlan = {
    tool: "forecastDemand",
    metric: metric === "orders" ? "orders" : metric === "revenue" ? "revenue" : "quantity",
    groupBy: "month",
    timeRange: query.timeRange ?? "all",
    dateFrom: from,
    dateTo: to,
    filters: { ...applied, dimension, key: query.key ?? null, method, horizonMonths: horizon },
    notes: [
      methodologyText(method),
      inventory.rationale,
      "Forecast is computed from historical monthly aggregates in the filtered dataset, not from the model.",
    ],
  };

  return {
    answer,
    chart,
    table,
    inventory,
    methodology: methodologyText(method),
    explain: {
      filters: { ...applied, rangeLabel, dimension, method },
      metrics: [metric, "forecast", "recommended_inventory"],
      dimensions: ["month", dimension],
      queryPlan,
    },
    warnings,
  };
}
