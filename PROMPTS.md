# Prompts

This project was built with **Claude Code** (model Claude Opus 5.5) in the VS Code extension, running every command inside WSL (Ubuntu). The prompts were written in Portuguese; each one is quoted as sent, followed by an English translation and what it produced.

## 1. Project specification

The first prompt was a detailed specification (in Portuguese) derived from the assignment. Summary:

> Build a full-stack calculator. Go backend exposing a REST API, React + TypeScript frontend consuming it, deployed with Docker Compose. Prioritize testable architecture, idiomatic code and complete documentation.
>
> - **Stack:** React 18 + TypeScript 5 + Vite; Go (stdlib `net/http`); testify; Vitest + React Testing Library; Docker + docker-compose; golangci-lint, ESLint + Prettier.
> - **Layout:** `backend/{cmd/server, internal/{handlers,services,models,middleware}}`, `frontend/src/{components,hooks,services,types}`.
> - **Endpoints:** `POST /api/v1/calculate`, `GET /api/v1/health`, `GET /api/v1/operations`.
> - **Rules:** add, subtract, multiply, divide (b = 0 → `DIVISION_BY_ZERO`), power (infinite result → error), sqrt (a < 0 → `NEGATIVE_SQRT`, b ignored), percentage (`(a*b)/100`).
> - **Validation:** closed enum (`INVALID_OPERATION`), non-JSON body (`INVALID_PAYLOAD`), Content-Type other than JSON → 415, check `math.IsInf`/`math.IsNaN`.
> - **Architecture:** handlers without logic; pure services behind a `Calculator` interface; models validated with tags; CORS, `log/slog` logger and panic recovery middlewares.
> - **Tests:** table-driven, mocked service in handler tests, coverage ≥ 85% (Go) and ≥ 80% (TS).
> - **Config:** `PORT`, `CORS_ORIGINS`, 10s timeouts, graceful shutdown.
> - **Frontend:** `<Calculator />`, `<OperationSelector />`, `<ResultDisplay />`, `useCalculator` hook, `api.ts` with `AbortController` (10s) and a typed `ApiError`; client-side validation; mobile-first with 480/768/1024 breakpoints; touch targets ≥ 44px.
> - **Delivery:** multi-stage Dockerfiles, `docker-compose.yml`, a 10-section README, Conventional Commits, `feature/<name>` branches, sentinel errors, discriminated unions, no `any`, this `PROMPTS.md` and a `v1.0.0` tag.
>
> Use https://github.com/golang-standards/project-layout as a structural reference.

Sent together with the specification:

> https://github.com/anthropics/skills instale esses plugins
>
> *(Install these plugins.)*

**Result:** installed the `anthropics/skills` marketplace plugins in Claude Code.

## 2. Environment

> utilize sempre o WSL para executar comandos, não utilize cmd e powershell, instale coisas apenas no wsl, responda em portugues
>
> *(Always use WSL to run commands, never cmd or PowerShell; install things only in WSL; answer in Portuguese.)*

**Result:** Go, golangci-lint and Node (via nvm) installed in the WSL user directory.

## 3. Start of implementation

> sim, instale no wsl o que for necessário. existe a skill para desenvolvimento em golang nas que você baixou do marketplace?
>
> *(Yes, install whatever is needed in WSL. Is there a Go development skill among the ones you downloaded?)*

**Result:** there was no Go skill in that marketplace. The backend was implemented first.

## 4. Go skills

> https://github.com/samber/cc-skills-golang instale essa skill e me fale como executar ela
>
> *(Install this skill and tell me how to run it.)*

**Result:** installed `cc-skills-golang`. Three of its skills guided the backend:
- `golang-lint`: the backend `.golangci.yml` starts from its recommended configuration (golangci-lint v2, gofumpt, goimports).
- `golang-stretchr-testify`: `require` for preconditions, `assert` for checks, `(expected, actual)` order, `AssertExpectations` on mocks.
- `golang-error-handling`: sentinel errors with `errors.Is`, `%w` wrapping, lowercase messages, internals never sent to clients.

The `frontend-design` skill guided the UI. The direction chosen was a bench instrument with a reflective LCD display as the one bold element; the layout was reviewed with Playwright screenshots on mobile, tablet and desktop.

## 5. Editor

> https://marketplace.visualstudio.com/items?itemName=golang.Go

**Result:** installed the VS Code Go extension on the WSL side (Remote - WSL), with gopls and delve, and configured it to use gofumpt and golangci-lint v2.

## 6. Securing frontend ↔ API communication

> para comunicação entre a api e frontend ser segura, o que poderia ser implementado? um jwt?
>
> *(To make communication between the API and the frontend secure, what could be implemented? A JWT?)*

**Result:** an analysis concluding that JWT authenticates users but does not secure transport, and that a public SPA cannot keep a token secret. Four measures were proposed: (1) HTTPS, (2) a single origin through a reverse proxy, (3) security headers, (4) rate limiting.

> use nginx para o 1, faça 2
>
> *(Use nginx for 1, do 2.)*

> implemente o 3 e 4
>
> *(Implement 3 and 4.)*

**Result:**
- nginx terminates TLS, generating a self-signed certificate when none is mounted, and proxies `/api` to a backend that is no longer published on the host.
- Security headers (CSP, HSTS, `X-Frame-Options` and others) are sent on every response.
- The backend rate-limits per client and trusts `X-Real-IP` only from trusted proxies.
- Everything was validated end to end with a standalone nginx and Chromium.

## 7. OWASP Top 10 review

> analise o projeto e valide a segurança do front e do bakcendo conforme o top 10 mais recentes da owasp https://github.com/OWASP/Top10/
>
> *(Analyze the project and validate the security of the frontend and backend against the latest OWASP Top 10.)*

> docker está ativo no wsl agora
>
> *(Docker is now running in WSL.)*

> sim
>
> *(Yes, proceed with the fixes.)*

**Result:** a review against the OWASP Top 10:2025, combining `govulncheck`, `npm audit`, Trivy, cipher probes and a memory probe. It found and fixed:
- 128 CVEs in the outdated `nginx:1.29` base image, now 0;
- weak TLS 1.2 ciphers;
- a rate-limit bypass through IPv6 address rotation, with unbounded memory;
- logs recording the proxy IP instead of the client IP;
- error messages that exposed Go type names.

CI gained `govulncheck`, `npm audit`, Trivy, an SBOM, Dependabot and SHA-pinned actions. Details are in [SECURITY.md](SECURITY.md).

## 8. Requirements check and finishing

The original assignment (in English) was pasted with:

> veja se o código atende a tudo que foi solicitado
>
> *(Check whether the code meets everything that was requested.)*

**Result:** a requirement-by-requirement check. Every functional and non-functional requirement was met; the gaps were delivery items (publishing the repository, documentation language, an outdated `PROMPTS.md` and wrong prerequisites).

> do node e do go, utilize as versões mais recentes e estáveis, não a ultima lançada necessariamente
>
> *(For Node and Go, use the latest stable versions, not necessarily the latest release.)*

**Result:** Node 24 LTS (Node 26 was not LTS yet) and Go 1.27, the newest Go minor already on its third patch release. CI tracks the latest patch of each line.

> faça tudo documentado e comentado em inglês
>
> *(Make all documentation and comments in English.)*

**Result:** README, SECURITY.md and this file written in English; code comments and configuration were already in English.

> avalie novamente se o projeto pode ser considerado seguro, escalável e se atende ao enunciado
>
> *(Evaluate again whether the project can be considered secure, scalable and compliant with the assignment.)*

> sim
>
> *(Yes, apply the fixes.)*

**Result:** a load test with `hey` and a horizontal scaling test found that nginx opened one backend connection per request (throughput fell from ~2,300 to ~1,000 req/s as concurrency grew) and ignored replicas added after startup. Fixes:
- upstream keepalive, DNS re-resolution and safe retries in nginx;
- CPU, memory and PID limits per container;
- a non-root nginx with all Linux capabilities dropped;
- coverage reports published by CI.

Throughput at 100 connections went from ~1,000 to ~7,400 req/s, and stopping a replica under load no longer causes errors.

> Idioma da UI deverá ser em inglês
>
> *(The UI language must be English.)*

**Result:** all interface text translated to English and numbers formatted with en-US conventions. Input now accepts only a dot as decimal separator; commas are rejected rather than guessed, since `1,000` is a thousands separator in English. Screenshots regenerated.
