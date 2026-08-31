"use client";

import { useState } from "react";
import type { AnalyticsResult } from "@/lib/analytics";
import type { ForecastResult } from "@/lib/forecast";
import { titleCase } from "@/lib/format";

type Result = AnalyticsResult | ForecastResult;

export function Explainability({ result }: { result: Result }) {
  const [openTable, setOpenTable] = useState(false);
  const filters = Object.entries(result.explain.filters).filter(
    ([, value]) => value !== null && value !== false && value !== "",
  );

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
      <p className="font-medium text-slate-200">Why this answer</p>
      {result.warnings.length > 0 ? (
        <p className="text-amber-300">{result.warnings.join(" ")}</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {filters.map(([key, value]) => (
          <span key={key} className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200">
            {titleCase(key)}: {String(value)}
          </span>
        ))}
      </div>
      <p>
        Metrics: {result.explain.metrics.join(", ") || "—"}. Dimensions:{" "}
        {result.explain.dimensions.join(", ") || "none"}.
      </p>
      {"methodology" in result ? <p>{result.methodology}</p> : null}
      {"inventory" in result ? <p>{result.inventory.rationale}</p> : null}
      <details className="rounded-lg bg-slate-900/80 p-2">
        <summary className="cursor-pointer text-slate-400">Query plan</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-400">
          {JSON.stringify(result.explain.queryPlan, null, 2)}
        </pre>
      </details>
      <button
        type="button"
        className="text-sky-300 hover:text-sky-200"
        onClick={() => setOpenTable((value) => !value)}
      >
        {openTable ? "Hide underlying data" : "Show underlying data"}
      </button>
      {openTable ? (
        <div className="max-h-48 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-400">
                {Object.keys(result.table[0] ?? { empty: "" }).map((key) => (
                  <th key={key} className="whitespace-nowrap px-2 py-1 font-medium">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.table.map((row, index) => (
                <tr key={index} className="border-t border-slate-800">
                  {Object.values(row).map((value, cell) => (
                    <td key={cell} className="whitespace-nowrap px-2 py-1">
                      {value ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
