"use client";

import { AlertTriangle, CheckCircle2, Clock3, Package, Truck } from "lucide-react";
import { formatDays, formatNumber, formatPercent, formatUsd } from "@/lib/format";
import type { KpiSet } from "@/lib/dashboard";

const CARDS = [
  { key: "totalOrders", label: "Total orders", icon: Package },
  { key: "deliveredOrders", label: "Delivered", icon: CheckCircle2 },
  { key: "delayedOrders", label: "Delayed", icon: AlertTriangle },
  { key: "onTimeRate", label: "On-time rate", icon: Truck },
  { key: "avgDeliveryDays", label: "Avg delivery time", icon: Clock3 },
] as const;

function valueFor(kpis: KpiSet, key: (typeof CARDS)[number]["key"]): string {
  switch (key) {
    case "totalOrders":
      return formatNumber(kpis.totalOrders);
    case "deliveredOrders":
      return formatNumber(kpis.deliveredOrders);
    case "delayedOrders":
      return formatNumber(kpis.delayedOrders);
    case "onTimeRate":
      return formatPercent(kpis.onTimeRate);
    case "avgDeliveryDays":
      return formatDays(kpis.avgDeliveryDays);
  }
}

export function KpiCards({ kpis }: { kpis: KpiSet }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.key} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="mb-3 flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wide">{card.label}</span>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-semibold tracking-tight text-slate-50">{valueFor(kpis, card.key)}</p>
            {card.key === "totalOrders" ? (
              <p className="mt-1 text-xs text-slate-500">{formatUsd(kpis.revenue)} GMV</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
