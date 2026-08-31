export const ORDER_STATUSES = [
  "delivered",
  "delayed",
  "in_transit",
  "exception",
  "canceled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Order = {
  client_id: string;
  order_id: string;
  order_date: string;
  delivery_date: string | null;
  carrier: string;
  origin_city: string;
  destination_city: string;
  status: OrderStatus;
  sku: string;
  product_category: string;
  quantity: number;
  unit_price_usd: number;
  order_value_usd: number;
  is_promo: boolean;
  promo_discount_pct: number;
  region: string;
  warehouse: string;
};

export type TimeRange =
  | "all"
  | "last_7_days"
  | "last_30_days"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "ytd"
  | "custom";

export type MetricName =
  | "orders"
  | "quantity"
  | "revenue"
  | "delayed_orders"
  | "delivered_orders"
  | "delay_rate"
  | "on_time_rate"
  | "avg_delivery_days";

export type Dimension =
  | "week"
  | "month"
  | "carrier"
  | "region"
  | "warehouse"
  | "category"
  | "destination"
  | "origin"
  | "status"
  | "sku"
  | "client";

export type ChartType = "bar" | "line" | "area" | "pie";

export type ChartSeries = {
  key: string;
  label: string;
};

export type ChartSpec = {
  type: ChartType;
  title: string;
  xKey: string;
  xLabel: string;
  series: ChartSeries[];
  data: Record<string, string | number | null>[];
};

export type QueryPlan = {
  tool: "queryAnalytics" | "forecastDemand";
  metric?: MetricName;
  groupBy?: Dimension | "none";
  timeRange: TimeRange;
  dateFrom: string | null;
  dateTo: string | null;
  filters: Record<string, string | boolean | number | null>;
  notes: string[];
};

export type TableRow = Record<string, string | number | null>;
