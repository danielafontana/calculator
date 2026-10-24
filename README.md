# Full-Stack Calculator

A calculator with a **Go** REST API backend and a **React + TypeScript** frontend, packaged with **Docker Compose**.

**At a glance**

| Requirement | Where |
|---|---|
| Add, subtract, multiply, divide + power, square root, percentage | [`backend/internal/services/calculator.go`](backend/internal/services/calculator.go) |
| REST API with validation, edge cases and JSON responses | [API examples](#6-api-examples), [error codes](#error-codes) |
| React UI with input validation, error handling and responsive layout | [`frontend/src`](frontend/src), [screenshots](#1-overview) |
| Unit tests and coverage for both layers | [Testing](#7-testing): backend 98.3%, frontend 98.7%; HTML reports published by CI |
| Setup, how to run, API usage, design rationale | [Quick start](#4-quick-start), [Development](#5-development), [Design decisions](#8-design-decisions) |
| Docker deployment of frontend + backend | [`docker-compose.yml`](docker-compose.yml): `docker compose up --build`; independent [versioning and releases](#versioning-and-releases) per component |
| Prompts used | [PROMPTS.md](PROMPTS.md) |
| Security review (OWASP Top 10:2025) | [SECURITY.md](SECURITY.md) |

## 1. Overview

The app supports seven operations: addition, subtraction, multiplication, division, power, square root and percentage. The frontend validates input, calls the API and shows the result on an LCD-style display. Division by zero, square root of a negative number and overflow produce messages that explain the problem and how to fix it.

| Desktop (≥ 1024px) | Tablet (≥ 768px) | Mobile (< 480px) |
|---|---|---|
| ![Desktop](docs/screenshots/desktop.png) | ![Tablet](docs/screenshots/tablet-sqrt.png) | ![Mobile with error](docs/screenshots/mobile-error.png) |

## 2. Architecture

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React 18 + TS (Vite)                                           │
│  components ──► hooks (useCalculator, useOperations) ──► api.ts │
│  (UI only)      (state, validation)        (fetch /api, 10s)    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS (TLS 1.2/1.3, HTTP/2), single origin
┌───────────────────────────────▼────────────────── nginx ────────┐
│ (unprivileged; host ports 3000/3443 → container 8080/8443)      │
│ :8080 /healthz, or 301 → HTTPS                                  │
│ :8443 /        → static SPA (dist/)                             │
│       /api/*   → upstream backend:8080 (keepalive, DNS refresh) │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP, Docker network (port not published)
┌───────────────────────────────▼──────────── Go 1.27 net/http ───┐
│ middleware: RequestID → Logger → Recover → CORS                 │
│             → [RateLimit → RequireJSON]                         │
│        │                                                        │
│ handlers   decode JSON, validate (models), call service, encode │
│        │                                                        │
│ services   Calculator (interface) → BasicCalculator (pure logic)│
│        │   sentinel errors: ErrDivisionByZero, ErrOverflow, ... │
│ models     CalculateRequest (validate tags), responses, codes   │
└─────────────────────────────────────────────────────────────────┘
```

**Layout** (follows [golang-standards/project-layout](https://github.com/golang-standards/project-layout)):

```
backend/
  cmd/server/main.go        wiring: config, logger, signals, listener
  internal/
    config/                 environment variables
    handlers/               HTTP ⇄ service (no business rules)
    httpjson/               JSON response helpers
    middleware/             request ID, slog logger, recover, CORS, rate limit, Content-Type
    models/                 request/response types, validation via struct tags
    server/                 routes and graceful shutdown
    services/               calculation rules (no HTTP dependency)
frontend/
  nginx/                    nginx templates (TLS, proxy, security headers)
  src/
    components/             Calculator (container), OperationSelector, ResultDisplay, NumberField
    hooks/                  useCalculator, useOperations
    services/api.ts         typed HTTP client (ApiError, timeout)
    types/                  domain types and discriminated unions
    utils/                  validation, formatting, operation metadata
```

**Request flow:** `POST /api/v1/calculate` passes through these steps:
1. `RequestID`, `Logger`, `Recover` and `CORS` run first.
2. `RateLimit` returns 429 when the client exceeded its limit.
3. `RequireJSON` returns 415 for a non-JSON body.
4. `handlers.Calculate` decodes the body, validates it with `models.Validate` and calls `services.Calculate`, which checks the result for `NaN`/`Inf`.

The handler encodes a 200 response; sentinel errors become 400, each with its own `code`.

## 3. Prerequisites

- [Go 1.27](https://go.dev/dl/), the latest stable line (tested with 1.27.3)
- [Node.js 24 LTS](https://nodejs.org/), 24.15 or newer (tested with 24.22.1). `frontend/.nvmrc` pins the line, so with nvm just run `nvm use`. Node 20 does not work: Vitest and jsdom require Node 24.15+.
- [Docker](https://docs.docker.com/engine/install/) with the Compose v2 plugin
- Optional: [golangci-lint v2](https://golangci-lint.run/) and `make`

## 4. Quick start

```bash
docker compose up --build
```

- App: <https://localhost:3443> (<http://localhost:3000> redirects to HTTPS)
- API, same origin: <https://localhost:3443/api/v1/health>

When no certificate is mounted, nginx generates a **self-signed certificate** at startup, so the browser shows a warning on the first visit. To continue, accept the risk (under "Advanced"); with `curl`, use `-k`. The backend is not published on the host: only nginx can reach it, through the internal Docker network.

To change ports or CORS origins, copy `.env.example` to `.env` and edit the values.

### HTTPS in production

Mount a real certificate (for example from Let's Encrypt via certbot) at `/etc/nginx/certs` as `fullchain.pem` and `privkey.pem`, by uncommenting the volume in `docker-compose.yml`:

```yaml
    volumes:
      - ./certs:/etc/nginx/certs:ro
```

When the certificate is present, the startup script does not generate a self-signed one. In production, use `HTTP_PORT=80`, `HTTPS_PORT=443` and `HSTS_MAX_AGE=31536000`.

For local HTTPS without the browser warning, generate the certificate with [mkcert](https://github.com/FiloSottile/mkcert) (`mkcert -cert-file certs/fullchain.pem -key-file certs/privkey.pem localhost 127.0.0.1`) and mount it as above. The mkcert CA must be trusted on the system that runs the browser.

## 5. Development

**Backend** (port 8080):

```bash
cd backend
go run ./cmd/server          # or: make run
```

**Frontend** (port 5173, proxies `/api` to `localhost:8080`):

```bash
cd frontend
nvm use                      # Node 24 LTS, from .nvmrc
npm install
npm run dev
```

Without `VITE_API_URL`, the frontend sends relative requests (`/api/...`) and Vite forwards them to the backend, so CORS does not come into play during development.

| Command | Description |
|---|---|
| `make lint` / `npm run lint` | golangci-lint / ESLint |
| `make fmt` / `npm run format` | gofumpt + goimports / Prettier |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `make build` / `npm run build` | binary in `bin/` / bundle in `dist/` |

**Backend environment variables**

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Comma-separated allowed origins (`*` allows any) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `RATE_LIMIT_RPS` | `10` | Requests per second per client IP (`0` disables) |
| `RATE_LIMIT_BURST` | `20` | Maximum burst per client |
| `TRUSTED_PROXIES` | empty | IPs/CIDRs allowed to report the real client IP via `X-Real-IP` |

**nginx variables** (`frontend` container)

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_HTTPS_PORT` | `443` (`3443` in compose) | Port used in the HTTP → HTTPS redirect |
| `BACKEND_ADDR` | `backend:8080` | Backend `host:port` on the Docker network; re-resolved every 10s |
| `HSTS_MAX_AGE` | `0` | HSTS `max-age`. Keep `0` with the self-signed certificate; use `31536000` with a real one |
| `CSP_CONNECT_SRC` | `'self'` | Origins the page may call. Add the API origin if `VITE_API_URL` points elsewhere |

**Container resources** (`docker-compose.yml`)

| Variable | Default | Description |
|---|---|---|
| `BACKEND_CPUS` / `BACKEND_MEMORY` | `1.0` / `128M` | Backend limits (Go sizes `GOMAXPROCS` from the CPU limit) |
| `BACKEND_GOMEMLIMIT` | `100MiB` | Go GC soft limit; keep it at ~80% of `BACKEND_MEMORY` |
| `FRONTEND_CPUS` / `FRONTEND_MEMORY` | `1.0` / `128M` | nginx limits; one worker per CPU. Raise `FRONTEND_CPUS` first when scaling (TLS is the first bottleneck) |

Read and write timeouts are 10s. The server shuts down gracefully on `SIGINT` or `SIGTERM`, waiting up to 10s for in-flight requests.

### Versioning and releases

Frontend and backend are versioned, released and deployed independently. They only share the API contract: `/api/v1` stays backward compatible, so any frontend 1.x works with any backend 1.x. A breaking change would ship as `/api/v2`, served alongside v1 until the frontend moves.

| | Backend | Frontend |
|---|---|---|
| Tag | `backend/vX.Y.Z` (also the Go module version, since the module lives in `backend/`) | `frontend/vX.Y.Z` (must match `frontend/package.json`) |
| Image | `ghcr.io/<owner>/calculator-backend` | `ghcr.io/<owner>/calculator-frontend` |
| Running version | `GET /api/v1/health` | `GET /version.json` |

The project tag `vX.Y.Z` marks a delivered combination of both (e.g. `v1.0.0` = backend 1.0.0 + frontend 1.0.0).

**Releasing a component.** Pushing its tag runs the same checks as CI. If they pass, the release workflow then:
1. builds the image with the version from the tag;
2. scans it with Trivy, before publishing;
3. pushes `X.Y.Z` (plus `X.Y` and `latest` for stable versions) to GHCR, with SBOM and SLSA provenance attached;
4. signs it with cosign (keyless);
5. creates a GitHub release whose notes list only that component's commits.

```bash
# backend
git tag -a backend/v1.1.0 -m "backend 1.1.0" && git push origin backend/v1.1.0

# frontend: bump package.json first
cd frontend && npm version 1.1.0 --no-git-tag-version && cd ..
git commit -am "chore(frontend): release 1.1.0"
git tag -a frontend/v1.1.0 -m "frontend 1.1.0" && git push origin frontend/v1.1.0
```

Pre-release tags (`backend/v1.2.0-rc.1`) publish only the exact version and are marked as pre-releases.

**Deploying released versions.** Each service's image and tag can be set independently. To update only the backend, run:

```bash
export BACKEND_IMAGE=ghcr.io/<owner>/calculator-backend BACKEND_TAG=1.1.0
export FRONTEND_IMAGE=ghcr.io/<owner>/calculator-frontend FRONTEND_TAG=1.0.0
docker compose up -d --no-build --pull always backend
```

The frontend keeps running, and nginx picks up the new backend replicas through DNS within 10s.

**Verifying an image signature:**

```bash
cosign verify ghcr.io/<owner>/calculator-backend:1.1.0 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/<owner>/<repo>/.github/workflows/release-image.yml@refs/tags/backend/v'
```

## 6. API examples

The examples target the development backend (`go run`, at `http://localhost:8080`). With Docker Compose, use `https://localhost:3443` and curl's `-k` flag, for example `curl -sk https://localhost:3443/api/v1/health`.

### `POST /api/v1/calculate`

```bash
curl -s -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","a":10,"b":5}'
```
```json
{"result":15,"operation":"add","operands":{"a":10,"b":5}}
```

Square root (`b` is optional and ignored):

```bash
curl -s -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' -d '{"operation":"sqrt","a":16}'
```
```json
{"result":4,"operation":"sqrt","operands":{"a":16}}
```

Percentage, `(a × b) / 100`:

```bash
curl -s -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' -d '{"operation":"percentage","a":200,"b":15}'
```
```json
{"result":30,"operation":"percentage","operands":{"a":200,"b":15}}
```

Division by zero (400):

```bash
curl -s -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' -d '{"operation":"divide","a":10,"b":0}'
```
```json
{"error":"division by zero","code":"DIVISION_BY_ZERO"}
```

Invalid operand type (400):

```bash
curl -s -X POST http://localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' -d '{"operation":"add","a":"ten","b":5}'
```
```json
{"error":"field \"a\" has an invalid value","code":"INVALID_PAYLOAD"}
```

Wrong Content-Type (415):

```bash
curl -s -X POST http://localhost:8080/api/v1/calculate -d '{}'
```
```json
{"error":"Content-Type must be application/json","code":"UNSUPPORTED_MEDIA_TYPE"}
```

#### Error codes

| HTTP | `code` | When |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | Body is empty, not valid JSON, not a single object, too large, or has a field of the wrong type or outside the float64 range |
| 400 | `INVALID_OPERATION` | `operation` missing or not one of the supported values |
| 400 | `MISSING_OPERAND` | `a` missing, or `b` missing for a binary operation |
| 400 | `DIVISION_BY_ZERO` | `divide` with `b = 0`, or `power` with `a = 0` and `b < 0` |
| 400 | `NEGATIVE_SQRT` | `sqrt` with `a < 0` |
| 400 | `OVERFLOW` | Infinite result (outside the float64 range) |
| 400 | `UNDEFINED_RESULT` | `NaN` result (e.g. `power` with a negative base and a fractional exponent) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` other than `application/json` |
| 429 | `RATE_LIMITED` | Per-client request limit exceeded; `Retry-After` says when to retry. Not applied to `/health` |
| 500 | `INTERNAL_ERROR` | Unexpected error (details are logged, never sent to the client) |

### `GET /api/v1/health`

```bash
curl -s http://localhost:8080/api/v1/health
```
```json
{"status":"ok","version":"1.0.0"}
```

`version` comes from the backend release tag (`backend/v1.0.0` → `1.0.0`); local builds report `dev`. The frontend reports its own version at `/version.json`.

### `GET /api/v1/operations`

```bash
curl -s http://localhost:8080/api/v1/operations
```
```json
{"operations":[
  {"name":"add","symbol":"+","description":"Sum of a and b","operands":2},
  {"name":"subtract","symbol":"−","description":"Difference of a and b","operands":2},
  {"name":"multiply","symbol":"×","description":"Product of a and b","operands":2},
  {"name":"divide","symbol":"÷","description":"Quotient of a divided by b","operands":2},
  {"name":"power","symbol":"^","description":"a raised to the power of b","operands":2},
  {"name":"sqrt","symbol":"√","description":"Square root of a (b is ignored)","operands":1},
  {"name":"percentage","symbol":"%","description":"b percent of a: (a × b) / 100","operands":2}
]}
```

## 7. Testing

**Backend:** table-driven tests with testify, a mocked service in handler tests, and integration tests for the router and graceful shutdown.

```bash
cd backend
go test -race -cover ./...   # per-package coverage
make cover                   # total coverage (coverage.out)
make cover-html              # writes coverage.html
```

**Frontend:** Vitest + React Testing Library, `renderHook` for hooks and `fetch` mocked with `vi.fn()`.

```bash
cd frontend
npm run test -- --coverage   # text report + HTML in coverage/index.html
```

| Layer | Target | Current |
|---|---|---|
| Backend (`./internal/...`, statements) | ≥ 85% | 98.3% |
| Frontend (statements) | ≥ 80% | 98.7% (88 tests) |

The Vitest configuration fails the build if frontend coverage drops below 80%.

**CI** (`.github/workflows/`) is split per component, so a change only runs the checks it affects:

| Workflow | Runs when | What it does |
|---|---|---|
| `backend.yml` | `backend/**` changes, weekly | lint, `govulncheck`, tests with coverage, image build + Trivy scan |
| `frontend.yml` | `frontend/**` changes, weekly | `npm audit` and signatures, lint, typecheck, tests with coverage, build, image build + Trivy scan |
| `stack.yml` | either side or `docker-compose.yml` changes | full stack smoke test (TLS, proxy, headers, API contract) |
| `release-backend.yml` / `release-frontend.yml` | a `backend/v*` / `frontend/v*` tag is pushed | see [Versioning and releases](#versioning-and-releases) |

Coverage HTML reports are uploaded as the `coverage-backend` and `coverage-frontend` artifacts, and the totals appear in the job summary. Trivy fails the build on fixable HIGH or CRITICAL findings.

Dependabot keeps Go and npm dependencies, Docker images and Actions up to date. The full security review, mapped to the OWASP Top 10:2025, is in [SECURITY.md](SECURITY.md).

## 8. Design decisions

**Handler/service layers.** The service knows nothing about HTTP: it takes `(operation, a, b)` and returns `(float64, error)`. Business rules are therefore tested without a server, and the handler is tested against a mock of the `Calculator` interface. Changing the transport (gRPC, CLI) does not touch the logic. Sentinel errors (`ErrDivisionByZero`, ...) are mapped to HTTP status and `code` in a single table in the handler.

**Stateless.** Each request carries everything it needs; there is no session or database. The service scales horizontally without coordination, restarts without losing data and is deterministic to test.

**float64.** It is the native number type of JSON (IEEE-754) and of JavaScript's `Number`, so both sides represent the same value without conversion. The cost is decimal imprecision (`0.1 + 0.2 = 0.30000000000000004`). The API returns the exact float, and the frontend formats it with up to 10 decimal places, showing `0.3`.

**Why not a decimal type (BigDecimal).** Go has no decimal type in the standard library (it would need `shopspring/decimal` or `math/big`). JSON would lose the precision anyway unless numbers were sent as strings, which would break the required contract (`"a": 10`) and force the frontend to use another library. Square roots and fractional powers are irrational and have no exact decimal representation either. For a general-purpose calculator, float64 with `Inf`/`NaN` detection is the right trade-off; for money, a decimal type would be the choice.

**CSS Modules instead of Tailwind.** The scope is small and the look is specific (raised keys, LCD display). CSS Modules give local scoping with no runtime or extra build dependency, keep the markup readable and use design tokens as CSS variables (`index.css`). Tailwind pays off in a larger design system or in a team that already uses it.

**Other decisions:**
- **Validation via struct tags** (`go-playground/validator`) with a custom `operation` rule, so the enum lives in one place (`models.Operations()`).
- **Operands are pointers** (`*float64`), to tell "missing" apart from `0`.
- **`-0` is normalized to `0`**, so the JSON never contains `-0`.
- **Percentage:** when `a × b` overflows but the final value fits, the calculation uses `a × (b / 100)`.
- **Client-safe errors:** JSON decoding errors are turned into generic messages, such as `field "a" has an invalid value`, that never expose Go type names.
- **`VITE_API_URL` is a build argument**, not a runtime variable, and is empty by default. Vite inlines it into the bundle at build time; empty means relative requests (`/api/...`).
- **`useOperations`** loads the operation list from the API and falls back to the local list if the API is down, so the UI stays usable.
- **`useCalculator`** ignores responses of requests that were superseded by newer ones, which avoids race conditions.

**HTTPS and a single origin.** nginx terminates TLS: TLS 1.2/1.3 with HTTP/2, only ECDHE + AEAD ciphers on TLS 1.2, and the hybrid post-quantum key exchange X25519MLKEM768 on TLS 1.3. It serves the SPA and proxies `/api/*` to the backend over the internal network. As a result:
- traffic between browser and server is encrypted;
- the backend is not exposed to the internet;
- the browser talks to a single origin, so the bundled frontend does not need CORS;
- nginx caps request bodies at 1 MiB before they reach Go.

The backend still speaks plain HTTP, but only inside the Docker network. JWT or sessions are only worth adding once the project has users: authentication does not replace TLS, and in a public SPA any token obtained without a login can be copied by anyone.

**Security headers.** They live in a snippet (`frontend/nginx/security-headers.inc.template`) included in every block that sends responses, because an `add_header` inside a `location` drops the ones inherited from `server`:
- `Content-Security-Policy`: scripts only from the same origin; styles and fonts also from Google Fonts; `connect-src 'self'`; `frame-ancestors 'none'`. Limits the damage of an XSS.
- `Strict-Transport-Security`: configurable, and off (`max-age=0`) with the self-signed certificate. With HSTS on, browsers would require a certificate they reject and the site would become unreachable.
- `X-Frame-Options: DENY`, against clickjacking.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy`: camera, microphone, geolocation, payment and USB disabled.
- `Cross-Origin-Opener-Policy: same-origin`.

nginx also hides its version (`server_tokens off`).

**Rate limiting.** A token bucket per client (`golang.org/x/time/rate`) returns 429 with `Retry-After` on `/calculate` and `/operations`. `/health` is excluded so health checks never get 429.
- **Client identification:** behind nginx, every connection comes from the proxy's IP. The backend therefore uses `X-Real-IP`, but only when the connection comes from an address in `TRUSTED_PROXIES`, so a direct client cannot dodge the limit by forging the header.
- **IPv6 grouped by /64:** an IPv6 client controls a whole /64, so limiting per address would be trivial to bypass.
- **Bounded memory:** idle buckets are dropped after 10 minutes, and the table holds at most 100,000 clients (about 16 MiB). Beyond that, new clients share an overflow bucket: an address-rotation attack is throttled as a group without affecting known clients.
- **Limitation:** state is in memory and per instance. With several replicas, the effective limit multiplies; the next step would be a shared store (Redis).

**Logging.** Each request is logged as one JSON line with `request_id` and `client_ip`. The request ID is generated by nginx and returned in the `X-Request-ID` header, and nginx logs the same ID, so lines from both services can be correlated. The client IP is resolved with the same trust rule as the rate limiter.

**Scalability.** The backend is stateless, so it scales horizontally:

```bash
docker compose up -d --scale backend=3
```

nginx re-resolves the backend through Docker DNS every 10s, so new replicas join the pool without a restart. Other choices that matter at scale:
- **Upstream keepalive.** nginx reuses connections to the backend instead of opening one per request. Without it, throughput dropped as concurrency grew and ephemeral ports ran out.
- **Safe retries.** Every API call is side-effect free, so nginx retries a failed request on another replica (`non_idempotent` included). Stopping a replica under traffic causes no errors.
- **Resource limits.** Each container has CPU, memory and PID limits; Go sizes `GOMAXPROCS` from the CPU limit and `GOMEMLIMIT` keeps the GC under the memory limit, and nginx runs one worker per CPU of its limit.

Measured with [hey](https://github.com/rakyll/hey) on a single machine (load generator included, rate limit disabled, `POST /calculate`):

| Setup | 100 connections | 500 connections |
|---|---|---|
| Go backend alone (no limits) | 47,095 req/s, p99 10 ms | 52,812 req/s, p99 48 ms |
| Full stack, default limits (1 CPU each) | 7,417 req/s, p99 26 ms | 5,109 req/s, p99 377 ms |
| Full stack, `FRONTEND_CPUS=2` | 12,175 req/s, p99 29 ms | 7,057 req/s, p99 306 ms |

nginx (TLS termination) saturates first, so `FRONTEND_CPUS` is the first knob to raise. The rate limiter is per instance; with N replicas the effective limit is N times higher (see [Rate limiting](#8-design-decisions)).

## 9. Assumptions

- **Numeric limits:** operands and results must fit in float64 (±1.797×10³⁰⁸). Larger operands are rejected while parsing (`INVALID_PAYLOAD`), and infinite results become `OVERFLOW`.
- **Precision:** about 15 to 17 significant digits. The frontend switches to scientific notation for values ≥ 10¹⁵ or < 10⁻⁶.
- **Frontend input:** accepts `12`, `-3.5`, `.5`, `1e6`, with a dot as decimal separator. Commas are rejected with a clear message instead of guessed: `1,000` could mean one thousand or one, and guessing wrong would silently give a wrong result. Results are formatted with en-US conventions (`1,234.5`).
- **No persistence:** no calculation is stored; there is no history and no authentication.
- **Operation names** are case-sensitive (`"ADD"` is invalid).
- **Request body** limited to 1 MiB (in nginx and in the backend).
- **Default rate limit:** 10 req/s per client, burst of 20. Clients behind the same NAT share the limit.
- **Self-signed certificate** by default, valid for `localhost` and `127.0.0.1` for 365 days. It is meant for local use only.

## 10. Future improvements

- **Authentication:** `HttpOnly`/`SameSite` session cookies or OIDC, once there are users.
- **Distributed rate limiting** (Redis), to run several backend replicas with one shared limit.
- **CSP without third parties:** self-host the fonts and drop Google Fonts from the policy.
- **History:** persist calculations (PostgreSQL) with pagination, and show recent results in the frontend.
- **WebSocket:** live results while typing and history sync across tabs.
- **Expressions:** evaluate full expressions (`2 * (3 + 4)`) with a dedicated parser.
- **Optional arbitrary precision:** a decimal mode with numbers sent as strings, for financial use.
- **Observability:** Prometheus metrics and OpenTelemetry tracing.
- **OpenAPI documentation** generated from the models.
- **End-to-end tests** with Playwright in CI.
