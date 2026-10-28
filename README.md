# Spanrail

Self-hostable LLM observability, evaluation, and prompt management. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for how it fits together, the design decisions
and why, and a full accounting of known gaps.

## Status

Working MVP: tracing (nested spans/generations, errors, cost/usage), prompt versioning,
deterministic-scorer evaluation (datasets + runs + regression comparison), dashboard auth
with per-project access control, an analytics overview, and an optional Go gateway that
records LLM calls (with network timing) without changing the calling app. **Not** production-hardened —
see "Known limitations" below before exposing this to anything but a trusted network.

## Install (one command)

Requires Docker with Compose v2. This pulls the published images; there is nothing to clone or build:

```bash
curl -fsSL https://raw.githubusercontent.com/Veeky-kumar/SpanRail/main/deploy/install.sh | sh
```

It creates a `spanrail/` folder, writes a `.env` with freshly generated secrets, starts Postgres, Redis, the
web app and the worker (applying database migrations first) and prints the address, `http://localhost:3000`.
Create an account there, then a project and an API key, and send your first trace with
`pip install spanrail` (see below) or the gateway.

Prefer to read before running? [`deploy/install.sh`](./deploy/install.sh) is short, and the stack is just
[`deploy/docker-compose.yml`](./deploy/docker-compose.yml) plus a `.env` (copy
[`deploy/.env.example`](./deploy/.env.example) and fill in the three secrets with `openssl rand -hex 32`).
Add the gateway with `docker compose --profile gateway up -d` once you have a key pair in `.env`.

The web app listens on `127.0.0.1` only: sign-up is open and there is no rate limiting yet, so put a reverse
proxy with TLS in front before exposing it (set `WEB_BIND=0.0.0.0` only behind one). Pin a version with
`SPANRAIL_VERSION=0.1.0` in `.env`; `latest` is the default. **Back up `.env`**: losing `API_KEY_SALT`
invalidates every API key.

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

The seed command prints a demo login (`demo@spanrail.local` / the printed password) and
an SDK key pair (`SPANRAIL_PUBLIC_KEY` / `SPANRAIL_SECRET_KEY`) — save the secret key,
it is hashed at rest and cannot be recovered.

In two separate terminals:

```bash
npm run dev      # dashboard + public API at http://localhost:3000
npm run worker   # background ingestion processor — traces won't appear without this running
```

Sign in at `http://localhost:3000/login` with the seeded demo account.

## Sending a trace (SDK)

**Python** ([`spanrail` on PyPI](https://pypi.org/project/spanrail/), no dependencies, Python 3.9+):

```bash
pip install spanrail
```

```python
from spanrail import Spanrail

sr = Spanrail("pk-...", "sk-...", base_url="http://localhost:3000")

trace = sr.trace("support-chat", user_id="u_123")
with trace.generation("answer", model="gpt-4o-mini", input="Where is my order?") as gen:
    gen.end(output="It shipped yesterday.", usage={"input": 12, "output": 7})
```

Events are sent from a background thread and flushed at exit; the SDK never raises into your app. See
[sdk-python/README.md](./sdk-python/README.md).

**TypeScript** (not yet published to npm; import the local source):

```ts
import { Spanrail } from "./sdk"; // not yet published — import the local source

const spanrail = new Spanrail({
  publicKey: process.env.SPANRAIL_PUBLIC_KEY!,
  secretKey: process.env.SPANRAIL_SECRET_KEY!,
  baseUrl: "http://localhost:3000",
});

const trace = spanrail.trace({ name: "my-agent-run", userId: "user_123" });
const span = trace.span({ name: "tool:search", input: { query: "..." } });
span.end({ output: { results: [] } });

const generation = trace.generation({ name: "llm:answer", model: "gpt-4o-mini" });
generation.end({ output: "...", usageDetails: { input: 120, output: 40 }, costDetails: { input: 0.00006, output: 0.00004 } });

await spanrail.shutdown(); // flushes any queued events before the process exits
```

Runnable, fuller examples:
- `examples/simple-agent.ts` — a multi-span agent workflow with a deliberate tool
  failure, to see error handling and nesting
- `examples/run-dataset-eval.ts` — the full dataset → run → deterministic-scorer loop

```bash
SPANRAIL_PUBLIC_KEY=pk-tw-... SPANRAIL_SECRET_KEY=sk-tw-... npx tsx examples/simple-agent.ts
```

## Analytics and growth (optional)

Spanrail has no telemetry: a self-hosted install never reports anything to anyone. If you run a public instance
(a landing page people sign up from), two optional features help you see who is arriving:

- **Umami** ([umami.is](https://umami.is), privacy-friendly, no cookies). Set `UMAMI_SCRIPT_URL` (your Umami
  script, for example `https://cloud.umami.is/script.js`) and `UMAMI_WEBSITE_ID`. The tracker loads only on the
  landing, sign-in and sign-up pages, never inside the signed-in app, and respects Do Not Track. With either
  variable unset, nothing is loaded.
- **Signups and funnel** at `/admin/growth`, for the addresses listed in `ADMIN_EMAILS` (comma separated; anyone else
  gets a 404). It counts accounts per day, how far people get (project, API key, trace, gateway call), and where
  they came from. At sign-up the app records the referring site, any `utm_source`/`utm_medium`/`utm_campaign`
  tags and a two-letter country (from a header such as `CF-IPCountry` when your host's edge network adds one). It
  never stores a path, a query string or an IP address, and the sign-up form says so. A first-party cookie
  (`sr_src`, 30 days) carries the source from the first page to the sign-up and is skipped when the browser sends
  Do Not Track.

## Running it in public

If the app is reachable from the internet, set `SIGNUPS_DISABLED=true` once your team has accounts: existing users
still sign in and the sign-up page says registration is closed. Sign-in, sign-up and ingestion are rate limited
(details in ARCHITECTURE.md), and `GET /api/health` answers `{"status":"ok"}` (or 503) for an uptime monitor.

## Backups

`.github/workflows/backup.yml` dumps the database every night, encrypts the dump and keeps it for 14 days as a
workflow artifact. It does nothing until you add two repository secrets: `BACKUP_DATABASE_URL` (the database's
external connection string) and `BACKUP_PASSPHRASE` (a long random passphrase you also keep somewhere safe). The dump
is encrypted because artifacts of a public repository can be downloaded by any signed-in GitHub user.

To restore, download the artifact, then:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in spanrail-YYYY-MM-DD.dump.enc -out spanrail.dump
pg_restore --no-owner --no-privileges --clean --if-exists -d "$DATABASE_URL" spanrail.dump
```

Try a restore into an empty database once, before you need it. Dumps are made with Postgres 18 tools, so restore them with
a `pg_restore` of version 18 or newer (an older one refuses the file). Restoring into an older server can print
warnings about settings it does not know; read them before trusting the result.

## Prompt management

```bash
curl -X POST http://localhost:3000/api/public/prompts \
  -H "authorization: Basic $(echo -n "$SPANRAIL_PUBLIC_KEY:$SPANRAIL_SECRET_KEY" | base64)" \
  -H "content-type: application/json" \
  -d '{"name":"support-agent","prompt":"You are a support agent. {{tone}}","labels":["production"]}'

curl "http://localhost:3000/api/public/prompts/support-agent?label=production" \
  -H "authorization: Basic $(echo -n "$SPANRAIL_PUBLIC_KEY:$SPANRAIL_SECRET_KEY" | base64)"
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

[`gateway/`](./gateway) is a separate service written in **Go** (its own module, standard library plus
`prometheus/client_golang`). It is a reverse proxy in front of an OpenAI-compatible API: it forwards each
request unchanged, including streaming responses, and reports the call to Spanrail as a generation with
DNS / connect / TLS / time-to-first-byte timings. It talks to Spanrail only through the public ingestion API,
so nothing in the Next.js app or the worker depends on it.

```
your app --> spanrail-gateway (Go) --> LLM provider
                   |
                   +--(async, batched)--> Spanrail  POST /api/public/ingestion
```

A prebuilt image (linux/amd64 and linux/arm64, about 5 MB) is published to GitHub Container Registry:

```bash
docker run -p 127.0.0.1:8080:8080 \
  -e UPSTREAM_URL=https://api.openai.com \
  -e SPANRAIL_BASE_URL=http://host.docker.internal:3000 \
  -e SPANRAIL_PUBLIC_KEY=pk-... -e SPANRAIL_SECRET_KEY=sk-... \
  ghcr.io/veeky-kumar/spanrail-gateway:latest
```

`host.docker.internal` reaches a Spanrail running on your machine from Docker Desktop; on Linux add
`--add-host=host.docker.internal:host-gateway`, or use your server's address. The gateway does not authenticate its
callers, so keep it bound to localhost or a private network.

To build it yourself you need **Go 1.27.3+** (the Docker image builds it for you). From the repo
root, with the key pair that `npm run db:seed` printed:

```bash
export SPANRAIL_PUBLIC_KEY=pk-... SPANRAIL_SECRET_KEY=sk-...
docker compose --profile gateway up -d --build gateway   # listens on 127.0.0.1:8080
```

Then point your OpenAI-compatible client's base URL at `http://localhost:8080/v1`; the provider key stays in the
client. Full configuration, the Go test/CI commands and the measured results are in
[gateway/README.md](./gateway/README.md) and [gateway/RESULTS.md](./gateway/RESULTS.md). The gateway has its own
CI workflow ([`.github/workflows/gateway.yml`](./.github/workflows/gateway.yml)): gofmt, vet, race-detector tests,
build, `govulncheck` and a Docker image build.

## Known limitations

Tracked in detail in [ARCHITECTURE.md](./ARCHITECTURE.md#known-mvp-gaps-explicit-not-hidden),
summarized here:

- **Basic rate limits only.** Sign-in, sign-up and ingestion are limited per address and per project, in memory in
  each web process (see "Running it in public" in ARCHITECTURE.md). The rest of the dashboard has none, and there is
  no password reset or email flow.
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
- **No automated end-to-end test suite for the Node app.** Automated coverage is unit-level (pure logic);
  the ingestion→worker→dashboard pipeline, auth, and eval flows are verified by the
  `examples/*.ts` scripts and ad hoc checks, not a repeatable CI-run E2E suite. The Go gateway is the exception:
  it has a scripted E2E (`gateway/scripts/e2e.sh`) against the full stack, run by hand, and its unit tests,
  vet and vulnerability check run in CI.
- **SDKs:** Python (`spanrail` on PyPI) and TypeScript (local source, not published to npm). Neither has
  dataset-specific helper methods — dataset/run endpoints are called directly over HTTP. The Go gateway is an
  alternative that needs no SDK, but it only understands OpenAI-compatible HTTP traffic.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
