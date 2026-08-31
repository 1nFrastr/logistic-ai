"use client";

import { carrierChart, performanceChart, volumeChart, type DashboardData, type DashboardRange } from "@/lib/dashboard";
import { formatNumber, formatPercent } from "@/lib/format";
import { DynamicChart } from "@/components/dynamic-chart";
import { KpiCards } from "@/components/kpi-cards";

const RANGES: { id: DashboardRange; label: string }[] = [
  { id: "all", label: "All 2025" },
  { id: "last_6_months", label: "6 months" },
  { id: "last_3_months", label: "3 months" },
  { id: "last_30_days", label: "30 days" },
];

export function DashboardPanel({
  data,
  onRangeChange,
}: {
  data: DashboardData;
  onRangeChange: (range: DashboardRange) => void;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300">Descriptive analytics</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">Operations dashboard</h2>
          <p className="mt-1 text-sm text-slate-400">
            As of {data.asOfDate}. Window {data.dateFrom} → {data.dateTo}.
          </p>
        </div>
        <div className="flex rounded-full border border-slate-800 bg-slate-900 p-1">
          {RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => onRangeChange(range.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                data.range === range.id ? "bg-sky-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <KpiCards kpis={data.kpis} />

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-2 text-sm font-medium text-slate-200">Order volume over time</h3>
          <DynamicChart chart={volumeChart(data)} />
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-2 text-sm font-medium text-slate-200">Delivery performance</h3>
          <DynamicChart chart={performanceChart(data)} />
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-2 text-sm font-medium text-slate-200">Carrier delay rate</h3>
          <DynamicChart chart={carrierChart(data)} height={280} />
        </article>
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-200">Region mix</h3>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3">Region</th>
                  <th className="pb-2 pr-3">Orders</th>
                  <th className="pb-2 pr-3">Delay rate</th>
                  <th className="pb-2">Avg days</th>
                </tr>
              </thead>
              <tbody>
                {data.byRegion.map((row) => (
                  <tr key={row.name} className="border-t border-slate-800 text-slate-200">
                    <td className="py-2 pr-3">{row.name}</td>
                    <td className="py-2 pr-3">{formatNumber(row.orders)}</td>
                    <td className="py-2 pr-3">{formatPercent(row.delayRate)}</td>
                    <td className="py-2">{row.avgDeliveryDays.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
