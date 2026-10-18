# LingoFlow

LingoFlow is a focused conversation loop for adult Hindi-speaking learners who are building practical English fluency. This repository currently contains the Phase 0 foundation: a reproducible Node.js runtime, a small Fastify API, and a minimal Vite/React shell. Learning-domain services and voice providers are added in later phases.

## Architecture

- **Web:** React 19 and Vite provide the minimal browser shell in `apps/web`.
- **API:** Fastify exposes the boot and health endpoints in `apps/server`.
- **Runtime:** Node.js `24.21.0` is pinned in `.nvmrc`, the package engine, and the Docker image.
- **Checks:** TypeScript project references, ESLint, and an offline Node test exercise the API without network calls or provider credentials.
- **Next layers:** The planned evidence ledger, learning projection, SQLite persistence, and ElevenLabs adapters will be kept behind application interfaces as they are implemented.

## Environment variables

Copy `.env.example` to `.env` for local configuration. `.env` is ignored by Git.

| Variable | Default | Description |
| --- | --- | --- |
| `LINGOFLOW_MODE` | `offline` | Use `offline` for local development; `live` requires the provider key once live adapters are available. |
| `HOST` | `0.0.0.0` | Fastify bind address. |
| `PORT` | `3000` | Fastify listen port. |
| `ELEVENLABS_API_KEY` | unset | Reserved for live provider integration; never commit it. |

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
docker run --rm --name lingoflow -p 3000:3000 lingoflow:local
```

Check the running container:

```bash
curl http://localhost:3000/health
```

The image defaults to offline mode and does not contain a `.env` file or credentials.

## Development run command

Run the Fastify API and Vite web shell together:

```bash
npm run dev
```

Open <http://localhost:5173>. The API health endpoint is available at <http://localhost:3000/health>.

For separate processes, use `npm run dev:server` and `npm run dev:web` in two terminals.

## Test command

The canonical offline test command is:

```bash
npm test
```

It runs an in-process Fastify smoke test and never calls a live provider. The complete local check sequence is:

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
6. For live mode, inject `ELEVENLABS_API_KEY` through the deployment secret manager and set `LINGOFLOW_MODE=live`; do not put secrets in the image or repository.

## Provider configuration

Phase 0 intentionally has no live provider calls. Offline mode is the default and is sufficient for every test and build. Later voice work will configure ElevenLabs Agents for live conversation and ElevenLabs TTS for phrase replay; those adapters must remain optional so the offline test command stays deterministic.

## Offline demo mode

Set `LINGOFLOW_MODE=offline` (the default) and run `npm run dev` or the Docker image. The browser shell displays that offline mode is ready, and `GET /health` returns a small JSON status response. No API keys, network requests, or external services are required.

## Privacy and data retention

The Phase 0 foundation does not collect or persist learner data. The API stores no session state and the browser shell contains no analytics or tracking. Future persistence and provider integrations must document retention and consent behavior before they are enabled.
