import { filterOrders, type AnalyticsFilters } from "@/lib/analytics";
import { DATASET, deliveryDays, isCompleted } from "@/lib/data";
import { monthKey } from "@/lib/dates";
import type { ChartSpec, TimeRange } from "@/lib/types";

export type DashboardRange = Extract<TimeRange, "all" | "last_30_days" | "last_3_months" | "last_6_months">;

export type KpiSet = {
  totalOrders: number;
  deliveredOrders: number;
  delayedOrders: number;
  inTransitOrders: number;
  onTimeRate: number;
  avgDeliveryDays: number;
  revenue: number;
  quantity: number;
};

export type BreakdownRow = {
  name: string;
  orders: number;
  delayed: number;
  delayRate: number;
  revenue: number;
  avgDeliveryDays: number;
};

export type DashboardData = {
  asOfDate: string;
  range: DashboardRange;
  dateFrom: string | null;
  dateTo: string | null;
  kpis: KpiSet;
  volumeByMonth: { month: string; orders: number; delayed: number; delivered: number }[];
  statusMix: { status: string; orders: number }[];
  byCarrier: BreakdownRow[];
  byRegion: BreakdownRow[];
  byCategory: BreakdownRow[];
};

function avgDays(rows: { days: number }[]): number {
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + row.days, 0) / rows.length;
}

function breakdown(
  rows: ReturnType<typeof filterOrders>["rows"],
  name: (order: (typeof rows)[number]) => string,
): BreakdownRow[] {
  const buckets = new Map<string, BreakdownRow & { daySum: number; dayCount: number; completed: number }>();
  for (const order of rows) {
    const key = name(order);
    const current = buckets.get(key) ?? {
      name: key,
      orders: 0,
      delayed: 0,
      delayRate: 0,
      revenue: 0,
      avgDeliveryDays: 0,
      daySum: 0,
      dayCount: 0,
      completed: 0,
    };
    current.orders += 1;
    current.revenue += order.order_value_usd;
    if (order.status === "delayed") current.delayed += 1;
    if (isCompleted(order)) current.completed += 1;
    const days = deliveryDays(order);
    if (days != null) {
      current.daySum += days;
      current.dayCount += 1;
    }
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      name: bucket.name,
      orders: bucket.orders,
      delayed: bucket.delayed,
      delayRate: bucket.completed === 0 ? 0 : bucket.delayed / bucket.completed,
      revenue: Math.round(bucket.revenue * 100) / 100,
      avgDeliveryDays: bucket.dayCount === 0 ? 0 : bucket.daySum / bucket.dayCount,
    }))
    .sort((a, b) => b.orders - a.orders);
}

export function getDashboardData(range: DashboardRange = "all"): DashboardData {
  const filters: AnalyticsFilters = { timeRange: range };
  const { rows, from, to } = filterOrders(filters);

  const deliveredOrders = rows.filter((order) => order.status === "delivered").length;
  const delayedOrders = rows.filter((order) => order.status === "delayed").length;
  const completed = deliveredOrders + delayedOrders;
  const days = rows
    .map((order) => deliveryDays(order))
    .filter((value): value is number => value != null)
    .map((value) => ({ days: value }));

  const volumeMap = new Map<string, { month: string; orders: number; delayed: number; delivered: number }>();
  const statusMap = new Map<string, number>();
  for (const order of rows) {
    const month = monthKey(order.order_date);
    const volume = volumeMap.get(month) ?? { month, orders: 0, delayed: 0, delivered: 0 };
    volume.orders += 1;
    if (order.status === "delayed") volume.delayed += 1;
    if (order.status === "delivered") volume.delivered += 1;
    volumeMap.set(month, volume);
    statusMap.set(order.status, (statusMap.get(order.status) ?? 0) + 1);
  }

  return {
    asOfDate: DATASET.asOfDate,
    range,
    dateFrom: from,
    dateTo: to,
    kpis: {
      totalOrders: rows.length,
      deliveredOrders,
      delayedOrders,
      inTransitOrders: rows.filter((order) => order.status === "in_transit").length,
      onTimeRate: completed === 0 ? 0 : deliveredOrders / completed,
      avgDeliveryDays: avgDays(days),
      revenue: Math.round(rows.reduce((sum, order) => sum + order.order_value_usd, 0) * 100) / 100,
      quantity: rows.reduce((sum, order) => sum + order.quantity, 0),
    },
    volumeByMonth: [...volumeMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    statusMix: [...statusMap.entries()].map(([status, orders]) => ({ status, orders })),
    byCarrier: breakdown(rows, (order) => order.carrier),
    byRegion: breakdown(rows, (order) => order.region),
    byCategory: breakdown(rows, (order) => order.product_category),
  };
}

export function volumeChart(data: DashboardData): ChartSpec {
  return {
    type: "area",
    title: "Order volume over time",
    xKey: "month",
    xLabel: "month",
    series: [
      { key: "orders", label: "Orders" },
      { key: "delayed", label: "Delayed" },
    ],
    data: data.volumeByMonth,
  };
}

export function performanceChart(data: DashboardData): ChartSpec {
  return {
    type: "bar",
    title: "Delivery performance",
    xKey: "status",
    xLabel: "status",
    series: [{ key: "orders", label: "Orders" }],
    data: data.statusMix.map((row) => ({ status: row.status, orders: row.orders })),
  };
}

export function carrierChart(data: DashboardData): ChartSpec {
  return {
    type: "bar",
    title: "Delay rate by carrier",
    xKey: "name",
    xLabel: "carrier",
    series: [{ key: "delayRatePct", label: "Delay rate %" }],
    data: data.byCarrier.map((row) => ({
      name: row.name,
      delayRatePct: Number((row.delayRate * 100).toFixed(1)),
      orders: row.orders,
    })),
  };
}
