import type { TimeRange } from "@/lib/types";
import { DATASET } from "@/lib/data";

const DAY_MS = 86_400_000;

export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), day));
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(date, mondayOffset);
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function weekKey(dateStr: string): string {
  return formatIsoDate(startOfWeek(parseIsoDate(dateStr)));
}

export function resolveTimeRange(
  range: TimeRange,
  customFrom?: string | null,
  customTo?: string | null,
  asOf = DATASET.asOfDate,
): { from: string | null; to: string | null; label: string } {
  const asOfDate = parseIsoDate(asOf);

  switch (range) {
    case "all":
      return { from: DATASET.dateMin, to: DATASET.dateMax, label: "Full dataset (2025)" };
    case "last_7_days":
      return {
        from: formatIsoDate(addDays(asOfDate, -6)),
        to: asOf,
        label: "Last 7 days",
      };
    case "last_30_days":
      return {
        from: formatIsoDate(addDays(asOfDate, -29)),
        to: asOf,
        label: "Last 30 days",
      };
    case "last_month": {
      const start = startOfMonth(addMonths(asOfDate, -1));
      const end = addDays(startOfMonth(asOfDate), -1);
      return {
        from: formatIsoDate(start),
        to: formatIsoDate(end),
        label: "Last calendar month",
      };
    }
    case "last_3_months":
      return {
        from: formatIsoDate(addDays(addMonths(asOfDate, -3), 1)),
        to: asOf,
        label: "Last 3 months",
      };
    case "last_6_months":
      return {
        from: formatIsoDate(addDays(addMonths(asOfDate, -6), 1)),
        to: asOf,
        label: "Last 6 months",
      };
    case "ytd":
      return {
        from: `${asOfDate.getUTCFullYear()}-01-01`,
        to: asOf,
        label: "Year to date",
      };
    case "custom":
      return {
        from: customFrom || DATASET.dateMin,
        to: customTo || DATASET.dateMax,
        label: "Custom range",
      };
  }
}

export function inRange(dateStr: string, from: string | null, to: string | null): boolean {
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

export function nextMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const date = addMonths(new Date(Date.UTC(year, month - 1, 1)), 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
