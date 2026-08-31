import { AppShell } from "@/components/app-shell";
import { getDashboardData } from "@/lib/dashboard";

export default function Home() {
  const data = getDashboardData("all");
  return (
    <div className="min-h-full bg-[#070b14] text-slate-100">
      <header className="border-b border-slate-800/80">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-sky-400">Spaceship take-home</p>
            <h1 className="text-lg font-semibold text-white">Logistics analytics</h1>
          </div>
          <p className="hidden text-xs text-slate-500 sm:block">
            Dashboard + AI orchestration · DeepSeek V4 Flash via Vercel AI Gateway
          </p>
        </div>
      </header>
      <main className="px-4 py-5 sm:px-6">
        <AppShell initialData={data} />
      </main>
    </div>
  );
}
