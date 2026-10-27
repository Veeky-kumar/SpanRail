# Spanrail: architecture and design decisions

Spanrail is a self-hostable LLM observability platform: traces, evaluations, prompt management and
analytics, plus an optional Go gateway that measures where the time in each LLM call goes. This document
describes how it fits together, why it is built that way, and what is not built yet.

## The system at a glance

```
                    +-------------------+
 your app --------> |  Go gateway       |-----------> LLM provider
 (OpenAI-compatible | (optional proxy)  |
  client)           +---------+---------+
                              | Observation reports (background, bounded queue)
 your app --SDK-----+         v
                    +--> POST /api/public/ingestion  (Next.js app, API-key auth)
                              |  validate -> stage in Postgres -> enqueue
                              v
                         Redis / BullMQ "ingestion" queue
                              |
                              v
                         Worker (Node)  merges staged events into Observation rows
                              |
                              v
                         Postgres  <---- Next.js dashboard (sessions, projects, traces,
                                         prompts, datasets, analytics, settings)
```

Runtime pieces:

| Piece | What it is | Talks to |
|---|---|---|
| Web app | Next.js 15 (App Router): dashboard pages, server actions and the public HTTP API | Postgres, Redis |
| Worker | Node process running BullMQ consumers (can also run inside the web process, see below) | Postgres, Redis |
| Postgres | The only data store: identity, configuration, staged events, observations, scores, prompts, datasets | none |
| Redis | The job queue between ingestion and the worker | none |
| Gateway | Optional Go reverse proxy in `gateway/` with its own `go.mod`; reports calls over the public API | provider, web app |
| SDK | `sdk/index.ts`, a TypeScript client for the ingestion API (local source, not yet published) | web app |

## Storage choice: Postgres only

Spanrail starts with Postgres as the single data store and keeps Redis only as a queue. That keeps a
self-hosted install to one database plus Redis. A column store for the high-volume tables is a documented,
evidence-triggered future step (see "Scaling path"), not a day-one requirement.

## Core model: a trace is derived, not stored

There is no separate `traces` table. A trace is synthesised from a flat set of observations that share a
`traceId`. One `Observation` table holds every span, generation and event; `parentObservationId` and
`traceId` define the tree, and trace-level fields (name, user, session, tags) are read off the root row
(the one with no parent).

Tree building (`src/server/traceTree.ts`):

1. A node whose `parentObservationId` is missing, unresolved within the trace, or its own id is promoted to
   a root instead of being dropped (events can arrive out of order).
2. Roots and siblings are ordered by `startTime`.
3. Children are attached recursively, producing nodes with a depth.
4. Anything unreachable from a root (a parent cycle, malformed data) is still shown, appended at depth 0.
   Data is never silently lost.

## Ingestion flow

```
SDK or gateway batch --> POST /api/public/ingestion
  -> API-key auth (public + secret pair; the secret is stored only as a salted hash)
  -> per-event Zod validation (discriminated union by event type)
  -> upsert into the IngestEvent staging table (idempotency key = project + event id)
  -> enqueue {stagingId} on the BullMQ "ingestion" queue
  -> respond 207 multi-status immediately (acknowledge before processing, so a client
     is never blocked on trace delivery)

Worker:
  pulls {stagingId} -> reads the staging row -> merges it into Observation
  (a create followed by an update for the same id is merged, not overwritten: the
  update fills in output and usage without erasing fields it does not carry)
  -> marks the staging row processed
```

Durability trade-off: the staging table in Postgres is the durability layer. There is no object-storage
copy of raw events, so there is no replay log. Adding one is the first step if replay or audit at scale is
needed. It is recorded here so the omission is not mistaken for an oversight.

Cost: only SDK-reported cost is stored (`costDetails` summed into `totalCost`). Spanrail does not compute
cost from a price table yet, and usage and cost are never invented when unknown.

## Data model

- `User`, `Project`, `ProjectMember` (role `OWNER` or `MEMBER`), `ApiKey`
- `IngestEvent`, the staging table described above
- `Observation`, the single span, generation and event table
- `Score`, scoped to a trace or an observation; `source` distinguishes API, annotation and evaluation
  origin; `dataType` is numeric, categorical or boolean
- `Prompt`, immutable version rows with a mutable `labels` array
- `Dataset`, `DatasetItem`, `DatasetRun`, `DatasetRunItem`

### API keys

A key is a public/secret pair. The secret is a high-entropy random token, so a fast salted SHA-256 is used
for verification (`src/server/apiKey.ts`). A slow password hash would add cost without adding security,
and a lookup runs on every ingestion call. There is no cache in `src/server/apiKeyAuth.ts` yet: every
request does a Postgres lookup, and a cache is the next step once ingestion rate makes that a bottleneck.

## Prompt management

Prompt rows are immutable and versioned: `Prompt.version` increments per `(projectId, name)`. Each row has
a mutable `labels: string[]`. Moving a label such as `production` strips it from the version that held it
and adds it to the new one in the same transaction as the insert, so a label is never held by two versions
and never needs a separate pointer table.

The link from a generation to the prompt it used is denormalised (`Observation.promptName`,
`promptVersion`, no foreign key). It is analytics data, not referential integrity, and a prompt may be
edited or removed after the fact. Verified through the API: post a prompt twice, confirm the label moved,
and confirm `GET .../support-agent?label=production` resolves the new version.

## Evaluation

`Dataset` -> `DatasetItem` -> `DatasetRun` -> `DatasetRunItem`. A run item snapshots the item's `input` and
`expectedOutput` when it is linked (`inputSnapshot`, `expectedOutputSnapshot`). Editing a dataset item
later does not change what a past run was judged against, so comparisons between runs stay honest.

Deterministic scorers (`exact_match`, `contains`, `json_valid`, in `src/server/scorers.ts`) need no
external service and run automatically when a run item is linked
(`POST /api/public/datasets/:id/runs/:runId/items`), writing a `Score` with `source: "EVAL"`. This was
verified end to end with a deliberately wrong case (`examples/run-dataset-eval.ts`) to confirm the scorers
discriminate between pass and fail.

LLM-as-judge is anticipated but **not implemented**. It needs a real model provider and has a real cost per
evaluation. Scorer names are namespaced (`exact_match` and so on for code; a future judge would use an
`llm_judge:*` prefix) so the UI can keep deterministic and model-based scores apart. Evaluation is done
for the deterministic half only.

## Authentication and project access

NextAuth (Auth.js) v5 with a Credentials provider and JWT sessions: no session store and no OAuth app
registration needed for a first run. Passwords use Node's built-in `scrypt` (per-user salt,
`timingSafeEqual`): no extra dependency, and memory-hard, which suits low-entropy human-chosen secrets. That
is deliberately different from the API-key hash above, whose secret is already high-entropy; both files
say so inline.

The NextAuth config is split into `auth.config.ts` (edge-safe) and `auth.ts` (full Node), so Prisma and
scrypt never enter the Edge middleware bundle. `trustHost: true` is set because a container's hostname is
rarely `localhost`; for a fixed public domain, tighten it with an explicit `AUTH_URL`.

Access control is a `ProjectMember` join table checked at one choke point (`requireProjectMember` and
`requireSessionProjectMember` in `src/server/projects.ts`). It is called from the `[projectId]` layout
(every page render) and again inside every mutating server action, so a route cannot ship without an
authorization check. A non-member opening a project URL gets a 404, not a 403, so the project's existence
is not revealed.

Verified against the real NextAuth HTTP protocol (CSRF token, credentials callback, session cookie), not
mocked. Known boundary: `OWNER` and `MEMBER` currently have the same permissions. The enum exists for
future use and nothing branches on it.

## The dashboard

- **Home** (signed in): a three-column page. The left rail shows workspace numbers from the database
  (projects, traces in the last seven days, calls through the gateway), a getting-started checklist derived
  from data (project, API key, first trace, first gateway call), links to the self-hosting docs, and a
  dated "what's new" list. The centre shows the user's own latest gateway-reported call on the time rail,
  with real phase durations, or a labelled sample when there is no gateway data yet. The right column is an
  "on this page" index, and the projects list and create form follow.
- **Traces**: a list and a per-trace view. The span list puts every step on one time axis (a "ruler"), and
  a generation's detail opens with its time budget so the slowest phase is the first thing read.
- **Prompts**, **Datasets and runs**, **Settings** (API keys), and **Analytics**.
- **Landing** (signed out, at `/`): a long-form page with an interactive "life of a call" explainer.

The isometric figures (the time rail and the intake desk on the auth pages) are built from a vendored kit
in `src/components/iso/` (MIT, notice kept beside it). Every number a figure shows comes from a pure model;
nothing on it is decorative data. Figures obey `prefers-reduced-motion` for automatic motion, and motion the
user asks for (Play, Replay, stepping) still plays.

### Analytics page

`/projects/:id/analytics`: KPI row (trace count, error rate, total cost, p50 and p95 latency) plus
trace-volume, cost and top-model charts, filterable to 7, 14 or 30 days. Latency percentiles use Postgres
`percentile_cont` over per-trace durations, so they are true percentiles, not approximations. Every query
is scoped by `projectId` and the selected range, so every number on the page agrees.

Charts are hand-built inline SVG (no charting library): single-hue sequential colour per metric, no
dual-axis charts, a table-view toggle on every chart, and a real hover layer. The categorical palette was
checked with a validator script rather than by eye. Verified against real ingested data: with 9 traces
(one erroring tool call) the KPI tiles matched a direct database cross-check.

Scaling note: these queries read `Observation` directly with no rollup table. That is fine at MVP volume;
the first remedy is a materialised daily rollup, not a rewrite.

## The Go gateway (`gateway/`)

A separate service (own `go.mod`, Go 1.27.3, standard library plus `prometheus/client_golang`; it shares no
code or build with the Node app). It sits in front of an OpenAI-compatible provider API as a reverse proxy
and reports each call to Spanrail as a generation with network timing: DNS, connect, TLS, time to first
byte and transfer. It talks to Spanrail **only through the public ingestion API** (Basic auth with the
project key pair). Nothing in the web app, schema, ingestion contract or worker was changed to support it.

```
client --> gateway --> provider
              |
              | Observation (bounded in-memory queue; drop and count when full)
              v
         batching workers --> POST /api/public/ingestion --> staging -> worker -> Observation
```

Decisions, each tied to something verified in this repository:

- **A trace is its own root observation** (`id == traceId`, no parent). A call that starts a new trace sends
  `trace-create`, `generation-create` and `generation-update`. A call that sets `X-Spanrail-Trace-Id` skips
  `trace-create` and attaches under the given trace.
- **All metadata goes on the `generation-update` only.** The worker replaces `Observation.metadata`
  wholesale while merging other fields, so splitting metadata across events would let one erase the other.
  Confirmed by reading `worker/processors/ingestion.ts` and by the end-to-end run.
- **Unknown is never zero.** Token usage is sent only when the provider reported it. A DNS, connect or TLS
  phase is sent only when it happened (a reused keep-alive connection has none). The gateway has no price
  table, so it never sends `costDetails`.
- **The request path never waits for Spanrail.** Observations pass through a bounded queue; when it is
  full the observation is dropped and counted. Verified against the real stack: 3,000 calls, 0 client
  errors, 1,034 delivered, 1,966 dropped, and exactly 1,034 generations stored.
- **Ingestion is idempotent per event id**, so the reporter retries (exponential backoff, full jitter) only
  the events that failed retryably, including per-event 5xx inside a 207 response.
- **The provider key never leaves the gateway path.** `Authorization` and other credential headers are
  always redacted, bodies are off by default, and the Spanrail secret key type refuses to print itself.
- **Clean shutdown.** On SIGTERM it stops taking calls and flushes what is queued.

Verified (numbers and raw output in `gateway/RESULTS.md`): 173 Go tests under `-race` plus 13 for the UI
parser; a scripted end-to-end run (15 assertions) against Postgres, Redis, the web app and the worker; SSE
passthrough that fails if the proxy buffers (mutation-checked); a real SIGTERM flush in a hardened
container; load tests with zero errors; three code reviews and an independent security review whose
findings were each fixed with a test; and a clean `govulncheck` (it found 9 standard-library
vulnerabilities in Go 1.27.0, so 1.27.2 was the first safe version, and a later disclosure (GO-2026-6809, `crypto/x509`) raised the requirement to 1.27.3). CI (`.github/workflows/gateway.yml`: gofmt, vet,
race tests, build, `govulncheck`, Docker build) runs green on GitHub.

Not verified, or known gaps: timing against a real HTTPS provider or HTTP/2 (only local servers were
used); streamed usage exists only when the client asks for it (`include_usage`) and only in OpenAI shape;
the queue is in memory, so a crash loses unsent events; the gateway does not authenticate its own callers;
under sustained load above Spanrail's ingest rate it drops events by design.

## Deployment

- **Local development**: `docker compose` for Postgres and Redis, `npm run dev` for the app, a separate
  worker process.
- **Self-host**: `docker-compose.prod.yml` with Dockerfiles under `docker/` (Next.js
  `output: "standalone"`). Run migrations and seeds through the `worker` container, because the standalone
  web image drops dev tooling, including the `prisma` CLI.
- **Single-process platforms**: with `ENABLE_INPROCESS_WORKER=true`, `src/instrumentation.ts` starts the
  ingestion worker inside the web process, for hosts that offer one process type only (Render's free tier is
  the motivating case). Local development and the two-container deployment never set it. Verified by
  stopping the standalone worker and confirming a real trace was ingested and processed by the web process
  alone.

## Verification record

Done and recorded so it is not merely claimed:

- **Unit tests** (`npm test`): trace-tree construction (nesting, ordering, orphan promotion, self-reference
  and cycle guards, empty input), scorers, password and key hashing, number formatting, and the figure
  models. Writing the formatting tests found a real bug (compacting at 1,000 instead of 10,000), and the
  implementation was fixed, not the test.
- **A fresh containerised deployment**, torn down to zero volumes and rebuilt, found two real bugs: the
  missing `prisma` CLI in the standalone web image (now run through the worker) and the NextAuth
  `UntrustedHost` rejection outside `localhost` (`trustHost: true`).
- **Worst-case data** sent through the real SDK and ingestion boundary (very long names, one-character and
  emoji names, a 25-level-deep 500-item payload, unbreakable URLs, edge-case scores). Found and fixed:
  trace-level scores invisible in the dashboard, an orphaned colon on empty scores, and unbounded table
  columns. Documented, not fixed: no field has an enforced maximum length anywhere in the stack.
- **Database restart**: restarting Postgres under the running web and worker containers lost no data, and
  both reconnected on their own.
- **Performance** (one Windows machine under Docker Desktop, not a capacity guarantee): about 105 events/s
  accepted in a 200-event burst, worker lag averaging 18.7 ms (max 42 ms). No sustained load test was run.

## Known MVP gaps

- No rate limiting on the ingestion API or the dashboard.
- No password reset or email flow, and sign-up is open.
- No blob storage or replay log.
- No LLM-as-judge scorer; deterministic scorers only.
- The SDK is TypeScript only, not published, and has no dataset helper methods.
- No field has an enforced maximum length.
- `OWNER` and `MEMBER` have identical permissions.
- No automated end-to-end suite for the Node app; the gateway has a scripted one, run by hand.

## Scaling path

If ingestion volume or analytical query latency demands it: add ClickHouse as a secondary store for
`Observation` and `Score`, keep Postgres for identity, configuration and prompts. Write-heavy time-series
data benefits from a column store; identity and configuration data do not.

## Stack

Node 24 and TypeScript for the app, plus the optional Go 1.27 gateway. The Node side is a single npm project
(no monorepo tooling): Next.js App Router for dashboard and public API, a Node worker for BullMQ consumers,
Prisma and Postgres, Redis for the queue, hand-written Tailwind components, NextAuth v5 for sessions, and
Docker Compose for self-hosting (`docker-compose.prod.yml`, `docker/`, and the README for commands).

It began as a pnpm workspace monorepo and was collapsed into one project: pnpm needs filesystem symlinks,
and symlink creation was blocked by policy on the development machine. A single project is also the right
scope at this size; splitting again later is straightforward.
