# Full-Stack Calculator

English | [Português](README.pt-BR.md)

A calculator with a **Go** REST API and a **React + TypeScript** frontend, run with **Docker Compose**.

```bash
docker compose up --build -d     # then open http://localhost:3000
```

## 1. Overview

Seven operations: addition, subtraction, multiplication, division, power, square root and percentage. The frontend is a standard calculator keypad (digits 0-9 and icon-only function keys) that works with mouse, touch and the physical keyboard. Every calculation is done by the API, and errors such as division by zero, a negative square root or overflow are explained on the display.

| Desktop (≥ 1024px) | Tablet (≥ 768px) | Mobile (< 480px) |
|:---:|:---:|:---:|
| <img src="docs/screenshots/desktop.png" alt="Desktop: 2 ^ 10 = 1,024" height="380"> | <img src="docs/screenshots/tablet-sqrt.png" alt="Tablet: 12 + square root of 9, with the pending + highlighted" height="380"> | <img src="docs/screenshots/mobile-error.png" alt="Mobile: division by zero error" height="380"> |
| `2 ^ 10 =` | `12 + √(9)`, with `+` pending | division by zero |

**Keyboard:** `0`–`9`, `.` or `,` (decimal), `+` `-` `*` `/`, `^` (power), `%`, `@` (√x), `q` (x²), `F9` (±), `Enter`/`=`, `Backspace`, `Delete` (CE), `Esc` (C).

Also in this repository: [SECURITY.md](SECURITY.md) (OWASP Top 10:2025 review), [PROMPTS.md](PROMPTS.md) (prompts used) and a [Postman collection](postman/).

## 2. Architecture

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React 18 + TS (Vite)                                           │
│  components ──► hooks (useKeypad, useCalculator) ──► api.ts     │
│  (UI only)      (keypad state machine)      (fetch /api, 10s)   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS (TLS 1.2/1.3, HTTP/2), single origin
┌───────────────────────────────▼────────────────── nginx ────────┐
│ (unprivileged; host ports 3000/3443 → container 8080/8443)      │
│ :8080 /healthz + app (local) or 301 → HTTPS (HTTP_MODE)         │
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

| Path | Contents |
|---|---|
| `backend/cmd/server` | wiring: config, logger, signals, listener |
| `backend/internal/` | `handlers` (HTTP only), `services` (calculation rules), `models` (types and validation), `middleware`, `config`, `server` (routes, graceful shutdown) |
| `frontend/src/` | `components` (Calculator, ResultDisplay, Keypad), `hooks` (useKeypad, useCalculator, useOperations), `services/api.ts`, `utils/keypad.ts` (pure state machine) |
| `frontend/nginx/` | nginx templates: TLS, `/api` proxy, security headers |
| `postman/` | API collection and environment |

The backend follows [golang-standards/project-layout](https://github.com/golang-standards/project-layout).

## 3. Prerequisites

- **To run:** [Docker](https://docs.docker.com/engine/install/) with Compose v2.
- **To develop:** [Go 1.27](https://go.dev/dl/) and [Node.js 24 LTS](https://nodejs.org/) (24.15+; `nvm use` reads `frontend/.nvmrc`). Optional: [golangci-lint v2](https://golangci-lint.run/) and `make`.

## 4. Quick start

```bash
docker compose up --build -d
```

- App: **<http://localhost:3000>**. API on the same origin: <http://localhost:3000/api/v1/health>.
- HTTPS: <https://localhost:3443>, with a self-signed certificate generated at startup (the browser warns on the first visit).
- Stop with `docker compose down`. All settings, with comments, are in [`.env.example`](.env.example) (copy it to `.env` to change them).

### Production checklist

1. `HTTP_MODE=redirect` (image default), so HTTP redirects to HTTPS.
2. Mount a real certificate at `/etc/nginx/certs` (`fullchain.pem`, `privkey.pem`) by uncommenting the volume in `docker-compose.yml`. Without it, the container logs a warning.
3. `HSTS_MAX_AGE=31536000`, only with a real certificate.
4. `HTTP_PORT=80` and `HTTPS_PORT=443`.

## 5. Development

```bash
# backend (port 8080)
cd backend && go run ./cmd/server

# frontend (port 5173; proxies /api to localhost:8080)
cd frontend && nvm use && npm install && npm run dev -- --host 127.0.0.1
```

| | Backend | Frontend |
|---|---|---|
| Lint | `make lint` | `npm run lint` |
| Format | `make fmt` | `npm run format` |
| Build | `make build` | `npm run build` |

**Versioning and releases.** Backend and frontend are versioned and released independently, and only share the `/api/v1` contract (any frontend 1.x works with any backend 1.x).

| | Backend | Frontend |
|---|---|---|
| Tag | `backend/vX.Y.Z` | `frontend/vX.Y.Z` (must match `package.json`) |
| Image | `ghcr.io/<owner>/calculator-backend` | `ghcr.io/<owner>/calculator-frontend` |
| Running version | `GET /api/v1/health` | `GET /version.json` |

Pushing a component tag reruns its CI checks, scans the image with Trivy, publishes it to GHCR with SBOM and provenance, signs it with cosign and creates a GitHub release. The project tag `vX.Y.Z` marks a delivered pair. To deploy one component, set its image and tag and recreate only that service:

```bash
BACKEND_IMAGE=ghcr.io/<owner>/calculator-backend BACKEND_TAG=1.1.0 \
  docker compose up -d --no-build --pull always backend
```

## 6. API examples

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/calculate` | Body `{"operation", "a", "b"}`; `operation` is `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt` or `percentage`; `b` is ignored by `sqrt` |
| `GET` | `/api/v1/operations` | Supported operations with symbol and description |
| `GET` | `/api/v1/health` | `{"status":"ok","version":"..."}` |

```bash
curl -s -X POST http://localhost:3000/api/v1/calculate \
  -H 'Content-Type: application/json' -d '{"operation":"add","a":10,"b":5}'
# {"result":15,"operation":"add","operands":{"a":10,"b":5}}

curl -s -X POST http://localhost:3000/api/v1/calculate \
  -H 'Content-Type: application/json' -d '{"operation":"divide","a":10,"b":0}'
# {"error":"division by zero","code":"DIVISION_BY_ZERO"}
```

**Postman.** Import [`postman/calculator.postman_collection.json`](postman/calculator.postman_collection.json) and [`postman/calculator-local.postman_environment.json`](postman/calculator-local.postman_environment.json), then select the **Calculator - Local** environment. The collection covers every operation and error case, with tests on each request. It can also run from the command line:

```bash
npx newman run postman/calculator.postman_collection.json -e postman/calculator-local.postman_environment.json
```

`baseUrl` is `http://localhost:3000` (Docker); use `http://localhost:8080` when running the backend with `go run`.

| HTTP | `code` | When |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | Body empty, not valid JSON or with a wrong type |
| 400 | `INVALID_OPERATION` | `operation` missing or unsupported |
| 400 | `MISSING_OPERAND` | `a` missing, or `b` missing for a binary operation |
| 400 | `DIVISION_BY_ZERO` | `divide` with `b = 0`, or `power` with `a = 0` and `b < 0` |
| 400 | `NEGATIVE_SQRT` | `sqrt` with `a < 0` |
| 400 | `OVERFLOW` / `UNDEFINED_RESULT` | Infinite / `NaN` result |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` other than `application/json` |
| 429 | `RATE_LIMITED` | More than 10 req/s per client (burst 20); see `Retry-After` |
| 500 | `INTERNAL_ERROR` | Unexpected error; details are logged, never returned |

## 7. Testing

```bash
cd backend && go test -race -cover ./...       # make cover-html writes coverage.html
cd frontend && npm run test -- --coverage      # HTML report in coverage/index.html
```

| Layer | Target | Current |
|---|---|---|
| Backend (statements) | ≥ 85% | 98.3% |
| Frontend (statements) | ≥ 80% | 99.6% (89 tests) |

CI is split per component: `backend.yml` and `frontend.yml` (lint, vulnerability scans, tests with coverage reports as artifacts, image build + Trivy) run only on their paths, `stack.yml` smoke tests the full stack, and the release workflows run on tags. Dependabot keeps dependencies, images and Actions up to date.

## 8. Design decisions

- **Handler/service layers.** The service knows nothing about HTTP, so business rules are tested without a server and handlers are tested against a mocked `Calculator` interface. Sentinel errors map to HTTP status and `code` in one table.
- **Stateless.** No sessions or database: the backend scales horizontally (`docker compose up -d --scale backend=3`) and restarts without losing anything.
- **float64, not a decimal type.** It is the native number of JSON and JavaScript, so both sides agree without conversion. The cost is decimal imprecision (`0.1 + 0.2`), hidden by formatting up to 10 decimals. A decimal type would need numbers as strings in JSON and would still not represent roots exactly; it would be the choice for money.
- **Keypad as a pure state machine** (`utils/keypad.ts`). Every key sequence is unit tested without React or network; components only render.
- **CSS Modules, not Tailwind.** Small scope and a specific look; local scoping with no runtime, and design tokens as CSS variables.
- **Single origin through nginx.** The SPA and `/api` share one origin, so the frontend needs no CORS and the backend is never exposed. TLS, security headers, rate limiting and logging are described in [SECURITY.md](SECURITY.md).
- **Built for scale.** nginx keeps upstream connections alive, re-resolves replicas every 10s and retries side-effect-free requests on another replica; containers have CPU and memory limits. Measured on one machine at 100 connections: about 47,000 req/s for the Go backend alone and 7,400 req/s through nginx with TLS at 1 CPU per container. nginx saturates first, so `FRONTEND_CPUS` is the first knob to raise.

## 9. Assumptions

- Operands and results must fit in float64; precision is about 15 to 17 significant digits.
- Numbers are entered on the keypad (up to 16 digits) and shown in en-US format (`1,234.5`).
- Percentage follows the API: `200 % 15 =` is 15% of 200.
- No persistence and no authentication; operation names are case-sensitive.
- Request bodies are limited to 1 MiB; the default rate limit is 10 req/s per client, shared behind a NAT.
- The local setup serves HTTP on port 3000 and a self-signed certificate on 3443; production follows the [checklist](#production-checklist).

## 10. Future improvements

- Authentication (session cookies or OIDC) once there are users.
- Shared rate limiting (Redis) across backend replicas.
- Calculation history with persistence.
- Full expressions (`2 * (3 + 4)`) with a parser.
- Optional arbitrary precision for financial use.
- Metrics (Prometheus) and tracing (OpenTelemetry).
- OpenAPI specification and end-to-end tests with Playwright.
