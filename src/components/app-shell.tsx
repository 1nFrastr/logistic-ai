"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { DashboardPanel } from "@/components/dashboard-panel";
import type { DashboardData, DashboardRange } from "@/lib/dashboard";

export function AppShell({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  async function onRangeChange(range: DashboardRange) {
    if (range === data.range) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?range=${range}`);
      if (!response.ok) throw new Error("Failed to load dashboard");
      setData((await response.json()) as DashboardData);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]">
      <div className={loading ? "opacity-70" : ""}>
        <DashboardPanel data={data} onRangeChange={onRangeChange} />
      </div>
      <div className="lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)]">
        <ChatPanel />
      </div>
    </div>
  );
}
