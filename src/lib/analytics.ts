import { DATASET, deliveryDays, getOrders, isCompleted } from "@/lib/data";
import { inRange, monthKey, resolveTimeRange, weekKey } from "@/lib/dates";
import type {
  ChartSpec,
  ChartType,
  Dimension,
  MetricName,
  Order,
  QueryPlan,
  TableRow,
  TimeRange,
} from "@/lib/types";

export type AnalyticsFilters = {
  timeRange?: TimeRange;
  dateFrom?: string | null;
  dateTo?: string | null;
  carrier?: string | null;
  region?: string | null;
  warehouse?: string | null;
  category?: string | null;
  sku?: string | null;
  status?: string | null;
  destination?: string | null;
  delayedOnly?: boolean;
};

export type AnalyticsQuery = AnalyticsFilters & {
  metric: MetricName;
  groupBy?: Dimension | "none";
  limit?: number;
  chartHint?: ChartType | "auto";
};

export type AnalyticsResult = {
  answer: string;
  chart: ChartSpec | null;
  table: TableRow[];
  explain: {
    filters: Record<string, string | boolean | number | null>;
    metrics: string[];
    dimensions: string[];
    queryPlan: QueryPlan;
  };
  warnings: string[];
};

type Bucket = {
  key: string;
  orders: number;
  quantity: number;
  revenue: number;
  delayed: number;
  delivered: number;
  completed: number;
  deliveryDaySum: number;
  deliveryDayCount: number;
};

const METRIC_LABEL: Record<MetricName, string> = {
  orders: "Order count",
  quantity: "Units shipped",
  revenue: "Order value (USD)",
  delayed_orders: "Delayed orders",
  delivered_orders: "Delivered orders",
  delay_rate: "Delay rate",
  on_time_rate: "On-time rate",
  avg_delivery_days: "Average delivery time (days)",
};

function matchesFilter(value: string, expected?: string | null): boolean {
  if (!expected) return true;
  return value.toLowerCase() === expected.toLowerCase();
}

function containsFilter(value: string, expected?: string | null): boolean {
  if (!expected) return true;
  return value.toLowerCase().includes(expected.toLowerCase());
}

function findClosest(input: string, options: string[]): string | null {
  const needle = input.toLowerCase();
  const exact = options.find((option) => option.toLowerCase() === needle);
  if (exact) return exact;
  const starts = options.filter((option) => option.toLowerCase().startsWith(needle));
  if (starts.length === 1) return starts[0];
  const contains = options.filter((option) => option.toLowerCase().includes(needle));
  if (contains.length === 1) return contains[0];
  return null;
}

function resolveKnown(input: string | null | undefined, options: string[], label: string, warnings: string[]) {
  if (!input) return null;
  const match = findClosest(input, options);
  if (match) return match;
  warnings.push(`Unknown ${label} "${input}". Valid examples: ${options.slice(0, 8).join(", ")}.`);
  return input;
}

export function filterOrders(filters: AnalyticsFilters): {
  rows: Order[];
  from: string | null;
  to: string | null;
  rangeLabel: string;
  warnings: string[];
  applied: Record<string, string | boolean | number | null>;
} {
  const warnings: string[] = [];
  const timeRange = filters.timeRange ?? "all";
  const { from, to, label } = resolveTimeRange(timeRange, filters.dateFrom, filters.dateTo);

  const carrier = resolveKnown(filters.carrier, DATASET.carriers, "carrier", warnings);
  const region = resolveKnown(filters.region, DATASET.regions, "region", warnings);
  const warehouse = resolveKnown(filters.warehouse, DATASET.warehouses, "warehouse", warnings);
  const category = resolveKnown(filters.category, DATASET.categories, "category", warnings);
  const sku = filters.sku
    ? (findClosest(filters.sku, DATASET.skus) ?? filters.sku)
    : null;
  if (filters.sku && sku && !DATASET.skus.some((item) => item.toLowerCase() === sku.toLowerCase())) {
    const hints = DATASET.skus.filter((item) =>
      item.toLowerCase().includes(filters.sku!.toLowerCase().split("-")[0] ?? ""),
    );
    warnings.push(
      `SKU "${filters.sku}" was not found.${hints.length ? ` Similar SKUs: ${hints.slice(0, 5).join(", ")}.` : ""}`,
    );
  }

  const rows = getOrders().filter((order) => {
    if (!inRange(order.order_date, from, to)) return false;
    if (!matchesFilter(order.carrier, carrier)) return false;
    if (!matchesFilter(order.region, region)) return false;
    if (!matchesFilter(order.warehouse, warehouse)) return false;
    if (!matchesFilter(order.product_category, category)) return false;
    if (sku && !matchesFilter(order.sku, sku)) return false;
    if (!matchesFilter(order.status, filters.status)) return false;
    if (!containsFilter(order.destination_city, filters.destination)) return false;
    if (filters.delayedOnly && order.status !== "delayed") return false;
    return true;
  });

  return {
    rows,
    from,
    to,
    rangeLabel: label,
    warnings,
    applied: {
      timeRange,
      dateFrom: from,
      dateTo: to,
      carrier,
      region,
      warehouse,
      category,
      sku,
      status: filters.status ?? null,
      destination: filters.destination ?? null,
      delayedOnly: filters.delayedOnly ?? false,
    },
  };
}

function emptyBucket(key: string): Bucket {
  return {
    key,
    orders: 0,
    quantity: 0,
    revenue: 0,
    delayed: 0,
    delivered: 0,
    completed: 0,
    deliveryDaySum: 0,
    deliveryDayCount: 0,
  };
}

function addOrder(bucket: Bucket, order: Order) {
  bucket.orders += 1;
  bucket.quantity += order.quantity;
  bucket.revenue += order.order_value_usd;
  if (order.status === "delayed") bucket.delayed += 1;
  if (order.status === "delivered") bucket.delivered += 1;
  if (isCompleted(order)) bucket.completed += 1;
  const days = deliveryDays(order);
  if (days != null) {
    bucket.deliveryDaySum += days;
    bucket.deliveryDayCount += 1;
  }
}

function metricValue(bucket: Bucket, metric: MetricName): number {
  switch (metric) {
    case "orders":
      return bucket.orders;
    case "quantity":
      return bucket.quantity;
    case "revenue":
      return Math.round(bucket.revenue * 100) / 100;
    case "delayed_orders":
      return bucket.delayed;
    case "delivered_orders":
      return bucket.delivered;
    case "delay_rate":
      return bucket.completed === 0 ? 0 : bucket.delayed / bucket.completed;
    case "on_time_rate":
      return bucket.completed === 0 ? 0 : bucket.delivered / bucket.completed;
    case "avg_delivery_days":
      return bucket.deliveryDayCount === 0 ? 0 : bucket.deliveryDaySum / bucket.deliveryDayCount;
  }
}

function dimensionValue(order: Order, dimension: Dimension): string {
  switch (dimension) {
    case "week":
      return weekKey(order.order_date);
    case "month":
      return monthKey(order.order_date);
    case "carrier":
      return order.carrier;
    case "region":
      return order.region;
    case "warehouse":
      return order.warehouse;
    case "category":
      return order.product_category;
    case "destination":
      return order.destination_city;
    case "origin":
      return order.origin_city;
    case "status":
      return order.status;
    case "sku":
      return order.sku;
    case "client":
      return order.client_id;
  }
}

function pickChartType(groupBy: Dimension | "none", hint?: ChartType | "auto"): ChartType {
  if (hint && hint !== "auto") return hint;
  if (groupBy === "week" || groupBy === "month") return "line";
  if (groupBy === "status") return "pie";
  return "bar";
}

function formatMetric(metric: MetricName, value: number): string {
  if (metric === "delay_rate" || metric === "on_time_rate") {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (metric === "avg_delivery_days") return `${value.toFixed(1)} days`;
  if (metric === "revenue") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }
  return new Intl.NumberFormat("en-US").format(Math.round(value * 100) / 100);
}

function rowFromBucket(bucket: Bucket, metric: MetricName): TableRow {
  return {
    group: bucket.key,
    orders: bucket.orders,
    quantity: bucket.quantity,
    revenue: Math.round(bucket.revenue * 100) / 100,
    delayed: bucket.delayed,
    delivered: bucket.delivered,
    delay_rate: Number((metricValue(bucket, "delay_rate") * 100).toFixed(1)),
    on_time_rate: Number((metricValue(bucket, "on_time_rate") * 100).toFixed(1)),
    avg_delivery_days: Number(metricValue(bucket, "avg_delivery_days").toFixed(2)),
    value: Number(metricValue(bucket, metric).toFixed(4)),
  };
}

export function runAnalyticsQuery(query: AnalyticsQuery): AnalyticsResult {
  const { rows, from, to, rangeLabel, warnings, applied } = filterOrders(query);
  const groupBy = query.groupBy ?? "none";
  const limit = Math.min(Math.max(query.limit ?? 12, 1), 50);

  const buckets = new Map<string, Bucket>();
  const total = emptyBucket("All");
  for (const order of rows) {
    addOrder(total, order);
    if (groupBy !== "none") {
      const key = dimensionValue(order, groupBy);
      const bucket = buckets.get(key) ?? emptyBucket(key);
      addOrder(bucket, order);
      buckets.set(key, bucket);
    }
  }

  const grouped = [...buckets.values()].sort((a, b) => metricValue(b, query.metric) - metricValue(a, query.metric));
  const limited = groupBy === "week" || groupBy === "month"
    ? [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key))
    : grouped.slice(0, limit);

  const table = groupBy === "none" ? [rowFromBucket(total, query.metric)] : limited.map((bucket) => rowFromBucket(bucket, query.metric));

  const chartType = pickChartType(groupBy, query.chartHint);
  let chart: ChartSpec | null = null;
  if (groupBy !== "none" && limited.length > 0) {
    chart = {
      type: chartType,
      title: `${METRIC_LABEL[query.metric]} by ${groupBy}`,
      xKey: "group",
      xLabel: groupBy,
      series: [{ key: "value", label: METRIC_LABEL[query.metric] }],
      data: limited.map((bucket) => ({
        group: bucket.key,
        value: Number(metricValue(bucket, query.metric).toFixed(4)),
        orders: bucket.orders,
        delayed: bucket.delayed,
      })),
    };
  }

  const notes = [
    `Filtered ${rows.length} of ${DATASET.rowCount} orders using order_date.`,
    "Delay rate and on-time rate use completed shipments only (delivered + delayed).",
    "Average delivery time uses orders with both order_date and delivery_date.",
  ];

  if (query.delayedOnly) notes.push("Restricted to status = delayed.");

  let answer: string;
  if (rows.length === 0) {
    answer = `No orders matched the filters (${rangeLabel}).`;
  } else if (groupBy === "none") {
    answer = `For ${rangeLabel}, ${METRIC_LABEL[query.metric]} is ${formatMetric(query.metric, metricValue(total, query.metric))} across ${total.orders} orders.`;
  } else {
    const top = limited[0];
    const last = limited[limited.length - 1];
    if (groupBy === "week" || groupBy === "month") {
      answer = `${METRIC_LABEL[query.metric]} by ${groupBy} for ${rangeLabel}: ${limited.length} points from ${limited[0]?.key} to ${last?.key}. Total ${formatMetric(query.metric, metricValue(total, query.metric))}.`;
    } else {
      answer = `${top.key} has the highest ${METRIC_LABEL[query.metric].toLowerCase()} at ${formatMetric(query.metric, metricValue(top, query.metric))} (${rangeLabel}).`;
    }
  }

  const queryPlan: QueryPlan = {
    tool: "queryAnalytics",
    metric: query.metric,
    groupBy,
    timeRange: query.timeRange ?? "all",
    dateFrom: from,
    dateTo: to,
    filters: applied,
    notes,
  };

  return {
    answer,
    chart,
    table,
    explain: {
      filters: { ...applied, rangeLabel },
      metrics: [METRIC_LABEL[query.metric], "orders", "delayed", "on_time_rate"],
      dimensions: groupBy === "none" ? [] : [groupBy],
      queryPlan,
    },
    warnings,
  };
}
