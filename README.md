# Tracewell

Self-hostable LLM observability, evaluation, and prompt management. An independent
implementation informed by reverse-engineering Langfuse's open-source architecture —
see [ARCHITECTURE.md](./ARCHITECTURE.md) for what was verified from its source, what
Tracewell does differently and why, and a full accounting of known gaps.

## Status

Working MVP: tracing (nested spans/generations, errors, cost/usage), prompt versioning,
deterministic-scorer evaluation (datasets + runs + regression comparison), dashboard auth
with per-project access control, and an analytics overview. **Not** production-hardened —
see "Known limitations" below before exposing this to anything but a trusted network.

## Quick start (local development)

Requires Node 24+, Docker, and a Postgres + Redis pair (the included Compose file
provides both).

```bash
npm install
cp .env.example .env            # edit if you changed the Compose ports below
docker compose up -d            # starts Postgres (5455) and Redis (6399)
npm run db:migrate               # applies the schema
npm run db:seed                  # creates a demo user, project, and API key — READ THE OUTPUT
```

The seed command prints a demo login (`demo@tracewell.local` / the printed password) and
an SDK key pair (`TRACEWELL_PUBLIC_KEY` / `TRACEWELL_SECRET_KEY`) — save the secret key,
it is hashed at rest and cannot be recovered.

In two separate terminals:

```bash
npm run dev      # dashboard + public API at http://localhost:3000
npm run worker   # background ingestion processor — traces won't appear without this running
```

Sign in at `http://localhost:3000/login` with the seeded demo account.

## Sending a trace (SDK)

```ts
import { Tracewell } from "./sdk"; // not yet published — import the local source

const tracewell = new Tracewell({
  publicKey: process.env.TRACEWELL_PUBLIC_KEY!,
  secretKey: process.env.TRACEWELL_SECRET_KEY!,
  baseUrl: "http://localhost:3000",
});

const trace = tracewell.trace({ name: "my-agent-run", userId: "user_123" });
const span = trace.span({ name: "tool:search", input: { query: "..." } });
span.end({ output: { results: [] } });

const generation = trace.generation({ name: "llm:answer", model: "gpt-4o-mini" });
generation.end({ output: "...", usageDetails: { input: 120, output: 40 }, costDetails: { input: 0.00006, output: 0.00004 } });

await tracewell.shutdown(); // flushes any queued events before the process exits
```

Runnable, fuller examples:
- `examples/simple-agent.ts` — a multi-span agent workflow with a deliberate tool
  failure, to see error handling and nesting
- `examples/run-dataset-eval.ts` — the full dataset → run → deterministic-scorer loop

```bash
TRACEWELL_PUBLIC_KEY=pk-tw-... TRACEWELL_SECRET_KEY=sk-tw-... npx tsx examples/simple-agent.ts
```

## Prompt management

```bash
curl -X POST http://localhost:3000/api/public/prompts \
  -H "authorization: Basic $(echo -n "$TRACEWELL_PUBLIC_KEY:$TRACEWELL_SECRET_KEY" | base64)" \
  -H "content-type: application/json" \
  -d '{"name":"support-agent","prompt":"You are a support agent. {{tone}}","labels":["production"]}'

curl "http://localhost:3000/api/public/prompts/support-agent?label=production" \
  -H "authorization: Basic $(echo -n "$TRACEWELL_PUBLIC_KEY:$TRACEWELL_SECRET_KEY" | base64)"
```

Or use the dashboard's Prompts tab, which hits the same code path.

## Running the test suite

```bash
npm run typecheck   # strict TypeScript across the whole project
npm test            # unit tests (pure logic: tree-building, scorers, hashing, formatting)
```

The unit suite covers logic that doesn't need a live database (trace-tree construction
including out-of-order/cyclic edge cases, deterministic scorers, password/API-key
hashing, number formatting). End-to-end behavior (ingestion → worker → dashboard,
auth/access-control, prompt versioning, the eval pipeline) is exercised by the
`examples/*.ts` scripts plus the manual verification steps recorded in this project's
development history — there is no automated E2E suite yet; see "Known limitations."

## Full containerized deployment

```bash
cp .env.production.example .env.production   # set real secrets — see the file's comments
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec web npx prisma migrate deploy
```

This builds and runs `web` and `worker` as containers alongside Postgres and Redis — the
same thing `npm run dev` / `npm run worker` do locally, packaged for a real deployment.
See [docker-compose.prod.yml](./docker-compose.prod.yml) and the Dockerfiles under
[docker/](./docker) for exactly what ships.

## Go gateway (optional)

[`gateway/`](./gateway) is a small Go reverse proxy that sits in front of an OpenAI-compatible API and
reports every call to Tracewell as a generation, including DNS / connect / TLS / time-to-first-byte timings.
It uses only the public ingestion API. See [gateway/README.md](./gateway/README.md); measured results are in
[gateway/RESULTS.md](./gateway/RESULTS.md).

## Known limitations

Tracked in detail in [ARCHITECTURE.md](./ARCHITECTURE.md#known-mvp-gaps-explicit-not-hidden),
summarized here:

- **No rate limiting.** The ingestion API and dashboard have no request-rate enforcement.
- **No LLM-as-judge evaluation.** Deterministic scorers (`exact_match`, `contains`,
  `json_valid`) are implemented and tested; model-based judging is architecturally
  anticipated (reserved `llm_judge:*` naming) but not wired to any provider — it would
  need a real API key and incur real cost, which wasn't approved for this build.
  See ARCHITECTURE.md's Evaluation section.
- **Flat RBAC.** `OWNER`/`MEMBER` project roles exist in the schema; nothing currently
  grants them different permissions.
- **Postgres-only storage.** No ClickHouse/blob-storage tier yet — fine at MVP volumes,
  documented as the first thing to add if ingestion scale or analytics query latency
  demands it (see ARCHITECTURE.md's "Scaling path").
- **No automated end-to-end test suite.** Automated coverage is unit-level (pure logic);
  the ingestion→worker→dashboard pipeline, auth, and eval flows are verified by the
  `examples/*.ts` scripts and ad hoc checks, not a repeatable CI-run E2E suite.
- **SDK is TypeScript-only**, local-source (not published to npm), and has no
  dataset-specific helper methods — dataset/run endpoints are called directly over HTTP.
