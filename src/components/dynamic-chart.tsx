"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/types";

const COLORS = ["#38bdf8", "#f59e0b", "#34d399", "#a78bfa", "#fb7185", "#22d3ee"];

function tooltipStyle() {
  return {
    backgroundColor: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 8,
    fontSize: 12,
  };
}

export function DynamicChart({ chart, height = 260 }: { chart: ChartSpec; height?: number }) {
  const data = chart.data;
  const series = chart.series;

  if (chart.type === "pie") {
    const pieKey = series[0]?.key ?? "value";
    return (
      <div className="h-full w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey={pieKey} nameKey={chart.xKey} innerRadius={50} outerRadius={80} paddingAngle={2}>
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle()} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const ChartImpl = chart.type === "line" ? LineChart : chart.type === "area" ? AreaChart : BarChart;

  return (
    <div className="h-full w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartImpl data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey={chart.xKey} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#334155" }} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#334155" }} width={48} />
          <Tooltip contentStyle={tooltipStyle()} />
          <Legend />
          {series.map((item, index) => {
            const color = COLORS[index % COLORS.length];
            if (chart.type === "line") {
              return (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              );
            }
            if (chart.type === "area") {
              return (
                <Area
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.18}
                />
              );
            }
            return <Bar key={item.key} dataKey={item.key} name={item.label} fill={color} radius={[4, 4, 0, 0]} />;
          })}
        </ChartImpl>
      </ResponsiveContainer>
    </div>
  );
}
