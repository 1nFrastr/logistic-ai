import { NextRequest, NextResponse } from "next/server";
import { getDashboardData, type DashboardRange } from "@/lib/dashboard";

const RANGES: DashboardRange[] = ["all", "last_30_days", "last_3_months", "last_6_months"];

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "all";
  const safeRange = RANGES.includes(range as DashboardRange) ? (range as DashboardRange) : "all";
  return NextResponse.json(getDashboardData(safeRange));
}
