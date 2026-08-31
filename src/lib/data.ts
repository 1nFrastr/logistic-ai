import ordersJson from "@/data/orders.json";
import type { Order, OrderStatus } from "@/lib/types";

const orders = ordersJson as Order[];

const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

export const DATASET = {
  asOfDate: "2025-12-30",
  rowCount: orders.length,
  dateMin: "2025-01-01",
  dateMax: "2025-12-30",
  statuses: uniqueSorted(orders.map((o) => o.status)) as OrderStatus[],
  carriers: uniqueSorted(orders.map((o) => o.carrier)),
  regions: uniqueSorted(orders.map((o) => o.region)),
  warehouses: uniqueSorted(orders.map((o) => o.warehouse)),
  categories: uniqueSorted(orders.map((o) => o.product_category)),
  origins: uniqueSorted(orders.map((o) => o.origin_city)),
  destinations: uniqueSorted(orders.map((o) => o.destination_city)),
  skus: uniqueSorted(orders.map((o) => o.sku)),
};

export function getOrders(): readonly Order[] {
  return orders;
}

export function deliveryDays(order: Order): number | null {
  if (!order.delivery_date) return null;
  const start = Date.parse(`${order.order_date}T00:00:00Z`);
  const end = Date.parse(`${order.delivery_date}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function isCompleted(order: Order): boolean {
  return order.status === "delivered" || order.status === "delayed";
}
