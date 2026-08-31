# Logistics Analytics

AI-powered analytics dashboard for the Spaceship Senior Engineer code test.

The app has two surfaces on one dataset:

- A traditional operations dashboard (KPIs + charts)
- A natural-language analyst that **routes questions to computed tools** and never invents numbers

Live dataset: 400 mock logistics orders for calendar year 2025 (`data/mock_logistics_data.csv`).

Original take-home materials (converted to Markdown):

- [Interview brief](docs/interview-brief.md)
- [Coding assignment](docs/coding-assignment.md)
- [Project spec](docs/logistics-spec.md)

## Setup

Prerequisites: Node.js 22+ and [pnpm](https://pnpm.io).

```bash
pnpm install
cp .env.example .env.local
```

Set `AI_GATEWAY_API_KEY` in `.env.local` (Vercel AI Gateway). The dashboard works without a key; Ask the data does not.

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | For AI chat (local) | Vercel AI Gateway API key. On Vercel, OIDC can replace this after the project is linked. |

No other secrets are needed. Do not commit `.env.local`.

### Deploy on Vercel

1. Push this repository to GitHub / GitLab / Bitbucket.
2. Import the project in Vercel (framework preset: Next.js, install command: `pnpm install`).
3. Add `AI_GATEWAY_API_KEY` in Project Settings → Environment Variables, or enable AI Gateway for the project.
4. Deploy.

Model used: `deepseek/deepseek-v4-flash` via the Vercel AI Gateway (AI SDK string provider).

## Architecture

```
Browser
  ├─ Dashboard (server-computed KPIs, client charts)
  └─ Ask the data (useChat)
        │
        ▼
   POST /api/chat
        │  DeepSeek V4 Flash interprets the question
        ▼
   Structured tool call
        ├─ queryAnalytics  → in-memory aggregations
        └─ forecastDemand  → monthly history + forecast
        │
        ▼
   Deterministic result (answer, chart spec, table, query plan)
        │
        ▼
   Model summarizes the tool output in prose
   UI renders chart + explainability from the tool payload
```

### Key design decisions

- **One read-only dataset**, loaded from JSON generated from the provided CSV. No database, because 400 rows fit in memory and Vercel serverless does not need a connection pool for this take-home.
- **Structured queries, not generated SQL.** The model fills a Zod schema (`metric`, `groupBy`, `timeRange`, filters). TypeScript computes the answer. Invalid SQL never runs.
- **AI is an orchestrator.** System prompt forbids inventing numbers. Tools return the numeric answer, chart spec, table, and query plan. The UI charts come from tool output, not from the model drawing.
- **As-of date is 2025-12-30** (max `order_date` in the file). “Last month” means November 2025, not the real-world current month.
- **Delay semantics use the `status` column.** `delayed` vs `delivered` are given by the dataset. On-time rate = delivered / (delivered + delayed). In-transit / exception / canceled are excluded from that denominator.
- **Average delivery time** is `delivery_date - order_date` in days, for rows that have a delivery date.

### Data flow

1. CSV → `src/data/orders.json` (checked in so the serverless bundle always contains the data).
2. `getOrders()` is the only data access path. Filters and aggregations are pure functions.
3. Dashboard range changes hit `GET /api/dashboard?range=…` and recompute the same functions.
4. Chat never reads the CSV itself; it only sees tool results.

## AI approach

Questions are interpreted by `deepseek/deepseek-v4-flash` with a system prompt that describes the schema and the two tools.

Tool selection:

| User intent | Tool |
| --- | --- |
| KPIs, rankings, “show X by Y”, delay rates | `queryAnalytics` |
| Predict demand, inventory planning | `forecastDemand` |

`stopWhen: isStepCount(5)` lets the model call a tool and then write a summary. Relative windows (`last_3_months`, `last_month`, …) are resolved in code against `2025-12-30`.

Ambiguous SKUs / carriers are resolved with exact-then-contains matching; the tool returns warnings plus similar values instead of guessing silently.

## Assumptions

- `status = delayed` is the definition of a delayed order (not a lead-time threshold we invented).
- On-time rate uses completed shipments only (`delivered` + `delayed`).
- Time filters apply to `order_date`.
- SKU-level history is sparse (355 SKUs / 400 orders). Forecasting a single SKU is supported but noisy; category / overall forecasts are more stable.
- Default forecast is exponential smoothing with a damped trend, plus a 20% inventory buffer. Moving average and linear regression are available via the tool schema.
- No authentication. Reviewers can open the deployed URL directly.

## Limitations

- The model cannot query arbitrary SQL, joins, or row-level PII beyond the mock file.
- No live carrier APIs, no write-backs, no user accounts.
- Forecasts are classical time-series baselines, not causal models. Promo / seasonality are not modeled beyond what is already in monthly totals.
- If `AI_GATEWAY_API_KEY` is missing locally (and OIDC is not available), chat returns an error; the dashboard still loads.
- Natural-language coverage is the subset encoded in the tool schema (metrics, dimensions, and filters listed above).

## Future improvements

- Persist query history server-side and allow pinning a chart to the dashboard.
- Add a validated SQL subset or DuckDB for larger extracts.
- Stronger SKU forecasts: hierarchical reconciliation (SKU → category → overall).
- Caching of identical tool inputs (the functions are already pure).
- Automated tests for every metric definition against fixture totals.
- CSV upload / warehouse connection for a real client.

## AI usage (disclosure)

This submission was implemented with assistance from Cursor. Architecture, metric definitions, and tool boundaries were specified to keep computation out of the model. Please treat this README as the source of those decisions.

## Scripts

```bash
pnpm dev      # local app
pnpm build    # production build
pnpm start    # serve the build
pnpm lint     # eslint
```
