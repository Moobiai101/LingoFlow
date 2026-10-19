# LingoFlow

LingoFlow is a focused conversation loop for adult Hindi-speaking learners who are building practical English fluency. The repository contains a Fastify API, durable SQLite learning persistence, provider-neutral voice boundaries, and a minimal Vite/React shell.

## Architecture

- **Web:** React 19 and Vite provide the minimal browser shell in `apps/web`.
- **API:** Fastify exposes learner, session, evidence, review, voice-context, tool, and webhook endpoints in `apps/server`; the Cloudflare production adapter in `apps/worker` exposes the browser-facing learning loop on Workers.
- **Persistence:** Node 24's built-in `node:sqlite` stores local development data; Cloudflare D1 stores production learners, objectives, phrases, sessions, and normalized evidence. The D1 migration reserves a `voice_events` table for normalized provider-event ingestion; raw provider payloads are never persisted. Schema migrations are versioned in `migrations/`.
- **Runtime:** Node.js `24.21.0` is pinned in `.nvmrc`, the package engine, and the Docker image.
- **Checks:** TypeScript project references, ESLint, and an offline Node test exercise the API without network calls or provider credentials.
- **Privacy boundary:** Provider webhooks are authenticated and normalized before storage. Raw provider payloads and raw audio are never stored.

## Environment variables

Copy `.env.example` to `.env` for local configuration. `.env` is ignored by Git.

| Variable | Default | Description |
| --- | --- | --- |
| `LINGOFLOW_MODE` | `offline` | Use `offline` for local development; `live` requires the provider key once live adapters are available. |
| `HOST` | `0.0.0.0` | Fastify bind address. |
| `PORT` | `3000` | Fastify listen port. |
| `LINGOFLOW_DB_PATH` | `data/lingoflow.sqlite` | SQLite database path; use `:memory:` for an ephemeral process. |
| `ELEVENLABS_API_KEY` | unset | Server-only key for live signed URLs and phrase replay; never commit it. |
| `ELEVENLABS_AGENT_ID` | unset | Required for live voice session connections. |
| `ELEVENLABS_VOICE_ID` | unset | Required for live `eleven_v4` phrase replay. |
| `ELEVENLABS_BASE_URL` | `https://api.elevenlabs.io` | Optional provider base URL for live adapters and local test doubles. |
| `LINGOFLOW_PROVIDER_TIMEOUT_MS` | `12000` | Per-request live provider timeout, bounded by the server. |
| `LINGOFLOW_PROVIDER_RETRIES` | `2` | Retries for transient provider/network failures; malformed or permanent 4xx responses are not retried. |
| `ELEVENLABS_WEBHOOK_SECRET` | unset | Required to authenticate ElevenLabs webhook deliveries. |
| `LINGOFLOW_TOOL_SECRET` | unset | Required to authenticate provider tool calls. |

`npm run check:env` prints a clear message when offline mode is active and fails with the missing key name when live mode is selected without credentials.

## Local setup

Requirements: Node.js `24.21.0` and npm. With `nvm`, run:

```bash
nvm install 24.21.0
nvm use 24.21.0
npm ci
cp .env.example .env
```

The project uses only local dependencies installed by `npm ci`. No global package installation is required.

## Docker setup

Build and run the API image without a host Node installation:

```bash
docker build -t lingoflow:local .
docker run --rm --name lingoflow -p 3000:3000 -v lingoflow-data:/app/data lingoflow:local
```

Check the running container:

```bash
curl http://localhost:3000/api/health
```

The image defaults to offline mode and does not contain a `.env` file or credentials.

## Cloudflare production deployment

The production deployment target is a Cloudflare Worker with a D1 database and
Worker static assets. The Node/Fastify + SQLite runtime remains available for
local development and the buildathon Docker check; Cloudflare Workers use the
native Worker/D1 adapter in `apps/worker` and never depend on a local filesystem
database.

Create the D1 database once, then put the returned ID into `wrangler.toml`:

```bash
npx wrangler login
npx wrangler d1 create lingoflow
# replace REPLACE_WITH_D1_DATABASE_ID in wrangler.toml
npm run db:migrate:remote
npx wrangler secret put ELEVENLABS_API_KEY
npm run deploy:cloudflare
```

The current public Worker deployment is
<https://lingoflow.sameerkhanx100.workers.dev>. Verify it after deployment
with:

```bash
curl https://lingoflow.sameerkhanx100.workers.dev/api/health
```

The Worker configuration keeps the non-secret Agent and voice IDs in
`wrangler.toml`; only `ELEVENLABS_API_KEY` is a secret. The current live Agent
uses the supported English `eleven_flash_v2` conversational model and the
`JBFqnCBsd6RMkjVDRZzb` George voice; phrase replay uses `eleven_v4`.

The Worker rejects JSON request bodies larger than 256 KiB, returns a request
correlation ID, and applies browser security headers. Cloudflare native rate
limit bindings allow up to 120 API requests and 20 voice requests per minute
per client/path key. The numeric rate-limit namespace IDs in `wrangler.toml`
must be unique within the Cloudflare account; change them if either ID is
already in use.

For local Worker/D1 verification:

```bash
npm run db:migrate:local
npm run dev:cloudflare
```

Copy `.dev.vars.example` to the ignored `.dev.vars` and add the local key if
you want to exercise live ElevenLabs calls through Wrangler. `npm run
build:cloudflare` performs a build plus Wrangler dry-run without deploying.

### Persistence and agent memory

Cloudflare D1 is the source of truth for learner/session state, phrases,
normalized evidence, review projections, and transfer history. Review queues
and mistake maps are deterministic projections rebuilt from D1 evidence; the
ElevenLabs agent never owns mastery or progress. Each voice connection receives
compact dynamic learner context, while the browser caps visible transcript and
deduplicates provider events. The current Worker stores browser learning-loop
events as normalized evidence; provider webhook normalization remains on the
Fastify adapter until a Worker ingestion route is added. ElevenLabs agent
privacy is configured with voice recording disabled, audio deletion enabled,
and a 30-day provider transcript retention window. LingoFlow stores no raw
audio.

## Development run command

Run the Fastify API and Vite web shell together:

```bash
npm run dev
```

Open <http://localhost:5173>. The API health endpoint is available at <http://localhost:3000/api/health>.

For separate processes, use `npm run dev:server` and `npm run dev:web` in two terminals.

## Test command

The canonical offline test command is:

```bash
npm test
```

It builds the local contract/domain/provider outputs, then runs in-process HTTP and repository tests without network calls or provider credentials. The complete local check sequence is:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Build command

Create production assets with:

```bash
npm run build
```

The API is written to `dist/server` and the browser bundle to `dist/web`. Start the built API with:

```bash
npm start
```

## Deployment steps

1. Run `npm ci` with Node `24.21.0`.
2. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
3. Build the image with `docker build -t <registry>/lingoflow:<tag> .`.
4. Push the image to the deployment registry.
5. Run the image with port `3000` exposed and `LINGOFLOW_MODE=offline` until live provider adapters are configured.
6. For live mode, inject `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, and `ELEVENLABS_WEBHOOK_SECRET` through the deployment secret manager and set `LINGOFLOW_MODE=live`; do not put secrets in the image or repository. Mount `/app/data` to durable storage.

## Provider configuration

Offline mode is the default and is sufficient for every test and build. Live mode can configure ElevenLabs Agents for browser conversation through a server-issued signed URL and ElevenLabs TTS for phrase replay. The browser never receives the API key. The live client path is optional so the offline test command stays deterministic.

The deployed ElevenLabs Agent owns its prompt configuration. LingoFlow sends
the learner/session context as supported dynamic variables and deliberately
does not send a prompt override; the Agent rejects prompt overrides unless
they are explicitly enabled in its configuration.

The current practice drill is intentionally transcript-only in offline mode. It stores normalized assessment evidence and does not claim microphone or phoneme-level pronunciation precision.

When the API is temporarily unavailable, evidence, transcript practice, and transfer writes are retained in a bounded browser outbox and retried idempotently on the next successful sync. The outbox contains normalized write payloads only; it never stores raw audio or provider credentials.

## Offline demo mode

Set `LINGOFLOW_MODE=offline` (the default) and run `npm run dev` or the Docker image. The browser shell displays that offline mode is ready, and `GET /api/health` returns a small JSON status response. No API keys, network requests, or external services are required.

## Privacy and data retention

SQLite/D1 stores learner state and normalized learning evidence in UTC timestamps. The API stores no raw audio and does not persist raw provider webhook payloads. The browser shell contains no analytics or tracking.

## API surface

The initial backend contract includes:

- `GET /api/health`
- `POST /api/learners`
- `GET /api/learners/:id/summary`
- `GET /api/learners/:id/review-queue`
- `GET /api/learners/:id/objectives`
- `POST /api/learners/:id/objectives`
- `POST /api/learners/:id/phrases`
- `POST /api/sessions`
- `POST /api/evidence`
- `POST /api/transfer-attempts`
- `GET /api/phrases/:id`
- `POST /api/voice/session-context`
- `POST /api/voice/connect`
- `POST /api/voice/replay`
- `POST /api/practice/assess`
- `POST /api/tools/:toolName` for authenticated, idempotent provider tool calls
- `POST /api/webhooks/elevenlabs` for HMAC-authenticated normalized ElevenLabs events
