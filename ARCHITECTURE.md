# Tracewell — Architecture & Design Decisions

Tracewell is an independent, self-hostable LLM observability/eval/prompt-management
platform. It is informed by reverse-engineering Langfuse's open-source implementation
(`../langfuse-reference`, MIT-licensed `web/`, `worker/`, `packages/` only — `ee/` was
never read for design purposes) but is architecturally its own system: different
storage topology, simplified trace model, different ingestion durability trade-off.

See `../langfuse-reference` research notes (not duplicated here) for what was actually
verified by reading source vs. inferred vs. unknown. Nothing in this document claims a
Langfuse internal behaves a certain way without that having been confirmed by reading
its code.

## Why this diverges from Langfuse's stack

Langfuse runs Postgres (identity/config) + ClickHouse (analytics) + Redis (queue) +
S3/MinIO (raw-event durability + replay). That's the right call at Langfuse's ingestion
volume. It roughly triples self-host operational complexity for an MVP. Tracewell
starts with **Postgres only** and documents ClickHouse as an explicit, evidence-triggered
future migration (see "Scaling path" below) rather than a day-one requirement.

## Core model: derived trace, not stored trace

Verified in Langfuse's current source: there is no separate `traces` table — a trace is
synthesized from a flat stream of observations where the root (no parent) carries
trace-level fields. Tracewell adopts this directly: one `Observation` table,
`parentObservationId` + `traceId` define the tree, and "trace metadata" (name, user,
session, tags) is read off the root row.

Tree-building, adapted from Langfuse's `ordering.ts`:
1. Dedupe by id, keeping the earliest `startTime` on conflict.
2. A node whose `parentObservationId` doesn't resolve within the same `traceId`
   (missing, or arrived out of order) is promoted to root rather than dropped.
3. DFS from roots, siblings ordered by `startTime`.
4. Any node unreachable from a root (cycle/malformed data) is still surfaced, appended
   at depth 0 — never silently dropped.

## Ingestion flow (MVP)

```
SDK batch --> POST /api/public/ingestion
  -> API-key auth (public+secret pair, salted hash, no plaintext secret stored)
  -> per-event Zod validation (discriminated union by event type)
  -> upsert into IngestEvent staging table (idempotency key = project+event id)
  -> enqueue {stagingId} on BullMQ "ingestion" queue
  -> respond 207 multi-status immediately (ack before processing, matches SDKs
     that must not block the host application on trace delivery)

Worker:
  pulls {stagingId} -> reads staging row -> merges into Observation
  (create/update pairs for the same id are merged, not overwritten wholesale —
  a "start" event followed by an "end" event with output/usage fills in fields,
  doesn't erase ones not present in the second payload)
  -> marks staging row processed
```

Deliberate simplification vs. Langfuse: no S3 blob-first write. The staging table in
Postgres is the durability layer for the MVP. This is the first thing to replace with
real object storage once replay/audit-at-scale is needed — noted here so it isn't
mistaken for an oversight later.

## Data model (MVP scope)

- `Project`, `ApiKey` (public/secret pair, SHA-256+salt hash — bcrypt is unnecessary
  cost here since the secret itself is a high-entropy UUID, same reasoning Langfuse
  uses)
- `Observation` (the single event/span/generation/trace-root table described above)
- `Score` (trace- or observation-scoped, `source` distinguishes API/annotation/eval
  origin, `dataType` numeric/categorical/boolean)
- `Prompt` (immutable version rows, mutable `labels: string[]` — moving a label is a
  transaction that strips it from the old version and adds it to the new one, same
  mechanism Langfuse uses and for the same reason: labels need to move atomically
  without a separate pointer table)
- Dataset/DatasetItem/DatasetRun/Eval models: scaffolded after the tracing slice is
  verified end-to-end, not before (see milestone plan).

## Prompt management (implemented, verified)

Immutable versioned rows (`Prompt.version`, auto-incremented per `(projectId, name)`) with
a mutable `labels: string[]` on each row — moving a label (e.g. `production`) off
whichever older version currently holds it and onto the new version happens inside the
same transaction as the insert. Same mechanism Langfuse uses, verified by reading its
source, and verified here by direct API testing (`POST /api/public/prompts` twice, then
confirming the label moved and `GET .../support-agent?label=production` resolves the new
version). The link from a generation back to the prompt it used is denormalized
(`Observation.promptName` / `promptVersion`, no FK) — analytics data, not referential
integrity, same reasoning as the ingestion flow above.

## Evaluation (implemented: deterministic scorers; stubbed: LLM-as-judge)

`Dataset` → `DatasetItem` → `DatasetRun` → `DatasetRunItem`. A `DatasetRunItem` snapshots
the item's `input`/`expectedOutput` at link time (`inputSnapshot`/`expectedOutputSnapshot`),
so a later edit to the dataset item doesn't retroactively change what a past run was
judged against — a simplified version of Langfuse's bitemporal dataset-item versioning,
achieving the same honesty-of-comparison goal without the full bitemporal model.

Deterministic scorers (`exact_match`, `contains`, `json_valid`, in `src/server/scorers.ts`)
need no external service and run automatically when a run item is linked
(`POST /api/public/datasets/:id/runs/:runId/items`), writing a `Score` row with
`source: "EVAL"`. Verified end-to-end with a deliberately-wrong test case
(`examples/run-dataset-eval.ts`) to confirm the scorer actually discriminates pass/fail
rather than trivially reporting success.

**LLM-as-judge is architecturally anticipated but not implemented**: it would need a real
model provider and incurs real cost per evaluation, which wasn't approved for this pass.
Scorer names are namespaced (`exact_match` etc. for code-based; a future judge would use
an `llm_judge:*` prefix) specifically so the UI can keep telling deterministic and
model-based scores apart once a judge exists — see Phase 4C's requirement to "clearly
distinguish deterministic metrics from model-based judgments." Do not read this as
"evaluation is done" — it is done for the deterministic half only.

## Dashboard authentication & project-level access control (implemented, verified)

NextAuth (Auth.js) v5 with a Credentials provider and JWT sessions — no separate session
store needed, no OAuth app registration required for a first run (a real constraint for
self-hosters). Passwords are hashed with Node's built-in `scrypt` (per-user random salt,
`timingSafeEqual` comparison) rather than bcrypt/argon2: no extra dependency, and scrypt
is memory-hard, appropriate for low-entropy human-chosen secrets — different reasoning
from the API-key hash (`src/server/apiKey.ts`), which uses a fast salted SHA-256 because
that secret is already a high-entropy random token. Documented inline in both files so
the difference isn't mistaken for inconsistency.

The NextAuth config is split (`auth.config.ts` edge-safe half + `auth.ts` full Node half)
specifically so Prisma/scrypt never ends up in the Edge middleware bundle — the
documented pattern for combining a Credentials provider with middleware-based route
protection.

Project-level access control is a `ProjectMember` join table (`userId`, `projectId`,
`role`), checked at a single choke point (`requireProjectMember` /
`requireSessionProjectMember` in `src/server/projects.ts`) called from both the
`[projectId]` layout (gates every page render) and independently inside every mutating
server action (gates the action itself, not just whatever the UI happened to render) —
same "a route cannot ship with no authorization check" discipline verified in Langfuse's
own `createAuthedProjectAPIRoute` pattern. A non-member hitting a project URL directly
gets a 404, not a 403, so project existence isn't leaked to someone without access.

Verified end-to-end against the real NextAuth HTTP protocol (CSRF token fetch →
credentials callback → session cookie), not mocked: an unauthenticated request to `/` or
`/projects/:id` redirects to `/login`; a signed-in member of a project gets a 200; a
signed-in user with zero memberships (including the pre-auth seeded project, which has
no membership rows) gets a 404 on that project and an empty list on their own home page.

Known boundary not yet built: no role-based permission *tiers* within a project beyond
`OWNER`/`MEMBER` (both can currently do the same things) — the enum exists for future
use, nothing branches on it yet. Don't read the enum's presence as finished RBAC.

## Analytics / overview dashboard (implemented, verified)

`/projects/:id/analytics` — KPI row (trace count, error rate, total cost, p50/p95
latency) plus trace-volume, cost, and top-models charts, with a 7/14/30-day filter.
Latency percentiles use Postgres's native `percentile_cont` over per-trace durations
rather than fetching rows and sorting in application code — an honest percentile, not
an approximation, and exactly the kind of query Postgres is good at (see the MVP
storage decision above). All queries are scoped by `projectId` and the selected date
range so every number on the page agrees with every other.

Charts are hand-built inline SVG (no charting library dependency) following the
project's dataviz skill: single-hue sequential color per metric (never a dual-axis
chart combining two measures), a table-view toggle on every chart (the accessibility
twin), and a real interactive hover layer — per-bar tooltips on the bar charts, a
snapping crosshair + tooltip on the cost line chart. The categorical reference palette
was run through the skill's validator (`validate_palette.js`) rather than eyeballed, even
though this page only uses single-hue sequential/status colors from it, not the full
categorical set.

Verified against real ingested data (not just an empty-state screenshot): populated a
project with 6 traces (one tool call deliberately erroring) and a 3-item dataset eval
run, then confirmed the KPI tiles matched by direct DB cross-check — 9 traces, 66.7%
error rate (6/9, correctly styled in the critical-red status color), summed cost
matching the known per-trace cost, and both models (`gpt-4o-mini`, `demo-model`)
appearing in the top-models chart in the correct count order.

Known scaling note: these queries read `Observation` directly with no pre-aggregated
rollup table. Fine at MVP volumes; the first thing to add if a project's data grows
large enough to make this slow is a materialized daily-rollup table (or the ClickHouse
migration already documented above), not a rewrite of this page.

## Phase 8 verification pass

Four things were done that hadn't been done before, each of which found and fixed at
least one real issue — logged here rather than just claimed.

**Automated unit tests** (`npm test`, 37 tests, all passing): trace-tree construction
(parent-child nesting, sibling ordering, out-of-order/orphan promotion, self-reference
and mutual-cycle guards, empty input), deterministic scorers, password/API-key hashing,
and number formatting. Writing the formatting tests caught a real bug: `formatCompactNumber`
compacted at 1,000 instead of matching the dataviz skill's own documented convention
("1,284" stays a plain integer; only 10,000+ compacts to "K") — fixed the implementation,
not the test. There is still no automated end-to-end suite; the ingestion→worker→
dashboard pipeline, auth, and eval flows are covered by the `examples/*.ts` scripts and
manual verification, not a repeatable CI-run E2E suite — see "Known MVP gaps."

**A genuinely fresh containerized deployment** (`docker-compose.prod.yml` + Dockerfiles
under `docker/`, Next.js `output: "standalone"`), torn down to zero volumes and rebuilt
from scratch, not just assumed from `npm run dev` working. Found and fixed two real bugs
in the process:
1. The web image's standalone output strips dev tooling, including the `prisma` CLI —
   `npx prisma migrate deploy` inside the web container silently tried to auto-install
   an unrelated future major version from the registry instead of using the project's
   pinned one. Fixed by running migration/seed commands through the `worker` container,
   which keeps full `node_modules` (and documented this in the README rather than
   leaving it to be rediscovered).
2. NextAuth v5's `UntrustedHost` protection rejected every request the moment the
   container's hostname wasn't literally `localhost` — a standard self-hosted/Docker
   gotcha. Fixed with `trustHost: true` in `auth.config.ts`, with the trade-off
   documented inline (appropriate for a single-tenant self-hosted app behind an
   operator-controlled proxy; tighten to an explicit `AUTH_URL` if fronting with a fixed
   public domain).

After both fixes: full auth flow, trace ingestion, worker processing, trace
visualization, and the analytics page were all re-verified against the actual
containerized app (not the local dev server) with real data.

**A break-ui pass** (realistic worst-case data sent through the real SDK/ingestion
boundary, per `examples/worst-case.ts` — not hand-edited database rows): a very long
realistic trace name/user id/session id, a one-character span name, an emoji/mixed-script
span name, a long realistic model id, a generation with no model name, a long status
message containing an un-breakable URL, a 25-level-deep plus 500-item JSON payload, and
score edge cases (`value: 0`, and a score with neither `value` nor `stringValue` set).
Found and fixed:
- **Broken**: scores attached at the trace level (`trace.score()`, no `observationId`)
  were captured correctly by the API but invisible everywhere in the dashboard — Prisma's
  `Observation.scores` relation only surfaces scores with a matching `observationId`, so
  a null-`observationId` score had no observation to attach to in the UI. Fixed by
  fetching trace-level scores separately and attaching them to the root observation
  (`getTraceLevelScores` in `queries.ts`).
- **Ugly**: a score with neither `value` nor `stringValue` rendered as an orphaned
  trailing colon ("empty-score: "). Fixed with an explicit `"—"` fallback.
- **Ugly/Fragile**: the trace list table had no width constraint on the trace name or
  user id columns — an unbounded-length name (no limit exists anywhere in the schema or
  validation) would push the table wider than its container. Fixed with `truncate` +
  a `title` tooltip on both columns.
- **Fragile, not fixed (documented instead)**: no field has an enforced maximum length
  anywhere in the stack (SDK, Zod schemas, or the `TEXT`/`JSON` Postgres columns) — "no
  limit" is itself the honest finding, not a false negative.
- **Held up correctly, confirmed by this pass**: the observation-tree row name already
  truncated properly (`min-w-0 flex-1 truncate`); the JSON input/output viewer handles
  the deep+large payload with a scrollable, height-capped box rather than breaking
  layout (500-item/25-level payload still rendered in 118ms, 60KB response); a `null`
  model name renders nothing rather than the literal string "null"; a `0`-valued score
  correctly rendered as `0` rather than being treated as falsy (nullish coalescing, not
  `||`); UTF-8/emoji/mixed-script names round-tripped intact through Postgres.
- Not re-verified interactively (no browser connection available this session): the
  `break-words` fix on the status-message overflow case was applied and confirmed
  present in the built output, but not click-verified by actually selecting that span in
  a live browser — stated explicitly rather than claimed as fully checked.

**Database-restart resilience** (tested, not assumed): restarted the Postgres container
out from under the running web and worker containers mid-session. Both reconnected on
their own on the next query — no manual restart needed, no data loss (`IngestEvent`
backlog returned to 0 unprocessed, and traces sent immediately after the Postgres
restart, before the worker's connection pool had reconnected, still landed correctly).
Worth recording precisely because a sloppier first pass at this exact test produced a
false "the worker needs a manual restart" conclusion — caused by an unrelated
inline-script tooling issue on the host shell, not the app — so the corrected,
cleanly-isolated re-test is the one that counts.

**Performance** (single Windows dev machine, Docker Desktop, not a tuned production
host — numbers are illustrative, not a capacity guarantee): the ingestion API accepted
~105 events/sec in a 200-event burst (50 traces × 4 events each); the worker's own
processing lag per event (staging-table write to Postgres-committed observation) averaged
18.7ms, max 42ms, with the full 200-event backlog fully drained by the time it was
checked. No sustained load test was run — this is a sanity measurement at MVP scale, not
a load-test result, and is reported as such.

## Alternate deployment mode: in-process worker (`src/instrumentation.ts`)

For platforms that only offer one long-running process type (no distinct
"background worker" resource — Render's free tier is the motivating case), the
ingestion worker can run inside the same Node process as the Next.js server via
Next.js's `instrumentation.ts` hook, gated behind `ENABLE_INPROCESS_WORKER=true`. Local
dev and the two-container Docker Compose deployment never set that variable, so they
keep running web and worker as separate processes exactly as before — this is additive,
not a replacement. Verified directly: stopped the standalone worker container, started
the web container alone with the flag set, and confirmed a real trace was both ingested
and fully processed by that single process.

## Known MVP gaps (explicit, not hidden)

- No rate limiting yet. Langfuse's own self-host rate limiting is a no-op by default
  (cloud-only) — explicitly not copying that gap; real rate limiting is a follow-up,
  not deferred indefinitely.
- No blob storage / replay log (see ingestion flow above).
- No LLM-as-judge scorer (see Evaluation section above) — deterministic scorers only.
- SDK has no dataset-specific helper methods yet; dataset/run endpoints are called
  directly over HTTP (see `examples/run-dataset-eval.ts`).
- No field has an enforced maximum length anywhere in the stack (SDK, Zod validation,
  or the underlying Postgres columns) — found during the Phase 8 break-ui pass and
  recorded as an honest "unbounded" rather than a false negative.
- No automated end-to-end test suite. Automated coverage (`npm test`) is unit-level pure
  logic; the ingestion→worker→dashboard pipeline, auth/access-control, and eval flows
  are verified by the `examples/*.ts` scripts plus the manual checks recorded in this
  project's development history, not a repeatable CI-run E2E suite.

## Scaling path (not built yet, documented so the MVP doesn't paint us into a corner)

If ingestion volume or analytical query latency actually demands it: add ClickHouse as
a secondary store for `Observation`/`Score`, keep Postgres for identity/config/prompts,
same split Langfuse uses, same reasoning (write-heavy time-series data benefits from a
column store; identity/config data doesn't).

## Stack

Node 24 / TypeScript, a single npm project (no monorepo tooling — see below), Next.js
(App Router) for dashboard + public API, a separate Node worker process for BullMQ
consumers, Prisma + Postgres, Redis for the queue, hand-written Tailwind components
(no shadcn/ui or other component library pulled in) for the dashboard, NextAuth v5 for
dashboard sessions, Docker Compose for self-host deployment (see `docker-compose.prod.yml`
and `docker/` for the containerized build, `README.md` for the exact commands).

**Originally scaffolded as a pnpm workspace monorepo (apps/web, apps/worker,
packages/\*) with Turborepo — abandoned mid-build and collapsed into this single
project.** Root cause, found by direct testing rather than assumption: pnpm's
content-addressable store fundamentally requires filesystem symlinks for every
dependency it links (not just workspace-local packages), and this specific Windows
environment blocked symlink creation at the OS policy level for every tested path —
Developer Mode, two different registry-key attempts, and an explicitly elevated
terminal all failed to change it. A monorepo split is reasonable at a larger team/feature
size, but it was unwarranted complexity for this MVP's actual size regardless of the
Windows issue; the single-project layout here is the right scope for now, not just a
workaround, and re-splitting later is straightforward if the project outgrows it.
