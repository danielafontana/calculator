# Security

This document maps the project's controls to the [OWASP Top 10:2025](https://owasp.org/Top10/2025/) and lists what is still open. Last review: 2026-10-24.

## Overview

The calculator is a public, stateless API. There are no users, sessions, database or stored personal data. The attack surface consists of:

- nginx, which terminates TLS, serves the SPA and proxies `/api`;
- three JSON endpoints in the Go backend.

The main risks are abuse (denial of service), transport configuration and the software supply chain.

## Controls by category

| Category | Status | Controls |
|---|---|---|
| **A01** Broken Access Control | ✅ | No private resources. Routes bound to one method (405 otherwise); backend not exposed to the internet (internal Docker network only); CORS restricted to configured origins; nginx has no directory listing and no repository files in the web root |
| **A02** Security Misconfiguration | ✅ / ⚠️ | Security headers on every response; `server_tokens off`; errors never expose internals (Go types, stack traces); both containers run as non-root users (nginx from `nginx-unprivileged`), with every Linux capability dropped and `no-new-privileges`; Trivy config scan clean. Open: read-only root filesystem |
| **A03** Software Supply Chain Failures | ✅ | Lockfiles (`go.sum`, `package-lock.json`); `go mod verify` and `npm audit signatures`; `govulncheck`, `npm audit` and Trivy (images) in CI, which fails on fixable HIGH or CRITICAL findings; CycloneDX SBOM per build; Dependabot for Go, npm, Docker and Actions; scheduled weekly CI run; latest stable toolchains (Go 1.27, Node 24 LTS) |
| **A04** Cryptographic Failures | ✅ | TLS 1.2/1.3 only; TLS 1.2 limited to ECDHE + AEAD (no CBC, no static RSA key exchange); TLS 1.3 with hybrid post-quantum key exchange (X25519MLKEM768). `HTTP_MODE=redirect` (image default) forces HTTPS; the local `docker compose` default serves the app over HTTP on localhost for convenience, and the [production checklist](README.md#production-checklist) covers the switch. A warning is logged when the self-signed certificate is in use |
| **A05** Injection | ✅ | No SQL, shell or server-side templates. JSON decoded into fixed types (`float64`, validated enum); JSON logs (`slog`) prevent log line injection; React escapes all output; CSP without `unsafe-inline` |
| **A06** Insecure Design | ✅ | Validation in both tiers; explicit limits (1 MiB body, 10s timeouts, rate limit); misuse-case tests (overflow, NaN, large body, IP rotation, forged headers) |
| **A07** Authentication Failures | ➖ | Not applicable: the API is public by design. If users are added, use `HttpOnly`/`Secure`/`SameSite` session cookies or OIDC |
| **A08** Software/Data Integrity Failures | ✅ / ⚠️ | Actions pinned by commit SHA; pinned golangci-lint and govulncheck versions; released images signed with cosign (keyless, verifiable against the release workflow identity) and published with SBOM and SLSA provenance attestations; images are scanned before they are pushed; no serialized data accepted without validation. No third-party resources are loaded by the page |
| **A09** Logging & Alerting Failures | ✅ | One JSON log line per request with `request_id`, `client_ip` (real client behind the proxy), status and duration; nginx logs the same `rid`; 4xx at WARN, 5xx and panics at ERROR with stack trace. Alerting depends on the log platform (out of scope) |
| **A10** Mishandling of Exceptional Conditions | ✅ / ⚠️ | Panic recovery with a generic response; fail closed (unknown errors become a detail-free 500); NaN and Inf handled; rate limiter with bounded memory (100,000 clients, ~16 MiB); CPU, memory and PID limits per container (`GOMEMLIMIT` below the memory limit); client and server timeouts; nginx retries a failed request on another replica. Open: React ErrorBoundary |

## Transport and security headers

- **Single origin.** nginx serves the SPA and proxies `/api/*` to the backend over the internal Docker network; the backend port is never published.
- **TLS.** TLS 1.2/1.3 with HTTP/2; TLS 1.2 only with ECDHE + AEAD ciphers; TLS 1.3 prefers the hybrid post-quantum X25519MLKEM768. `HTTP_MODE=redirect` (image default) sends HTTP to HTTPS; the local `docker compose` default (`app`) also serves the app over HTTP for convenience.
- **Headers** (`frontend/nginx/security-headers.inc.template`, included in every block that sends responses, because an `add_header` inside a `location` drops the inherited ones):
  - `Content-Security-Policy`: everything only from the same origin (no web fonts or third-party scripts); `frame-ancestors 'none'`.
  - `Strict-Transport-Security`: `HSTS_MAX_AGE`, `0` by default; enable it only with a trusted certificate.
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`.
  - `Permissions-Policy`: camera, microphone, geolocation, payment and USB disabled.
  - `server_tokens off` hides the nginx version.
- **Authentication** is intentionally absent: the API is public. JWT or sessions only make sense once there are users, and they do not replace TLS.

## Logging

One JSON line per request (`log/slog`) with `request_id`, `client_ip`, method, path, status and duration. nginx generates the request ID, passes it to the backend, returns it in `X-Request-ID` and logs the same ID, so both services can be correlated. The client IP follows the same trust rule as the rate limiter.

## Rate limiting

- Token bucket per client: 10 req/s with a burst of 20 (`RATE_LIMIT_RPS`, `RATE_LIMIT_BURST`), applied to `/calculate` and `/operations` but not to `/health`.
- **IPv6 grouped by /64.** A single subscriber controls a whole /64; with one bucket per address, rotating addresses would bypass the limit entirely.
- **Bounded memory.** At most 100,000 tracked clients. Beyond that, new clients share an overflow bucket: an address-rotation attack is throttled as a group while known clients keep their own allowance.
- **Client IP source.** `X-Real-IP` is accepted only from peers in `TRUSTED_PROXIES`, so a direct client cannot forge its address.
- **Limitation:** state is in memory, per instance. Several replicas would need a shared store (Redis).

## Automated checks

| Tool | Where | Fails the build when |
|---|---|---|
| golangci-lint (includes `gosec`) | CI, backend | any finding |
| `govulncheck` | CI, backend | a reachable vulnerability exists |
| `npm audit` | CI, frontend | a HIGH or more severe vulnerability exists |
| `npm audit signatures` | CI, frontend | a package signature is invalid |
| Trivy | CI and release, images | a fixable HIGH or CRITICAL vulnerability exists (a release never pushes such an image) |
| Smoke test (`stack.yml`) | CI, full stack | a header is missing, a weak cipher is accepted or the backend is exposed |
| Tag check | release | the tag is not `<component>/vX.Y.Z`, or `frontend/package.json` does not match it |

## Known open items

| Priority | Item | Category |
|---|---|---|
| Low | Read-only root filesystem (`read_only: true` with `tmpfs` for the paths nginx writes at startup) | A02 |
| Low | React ErrorBoundary, so a rendering error does not leave a blank screen | A10 |
| Low | Move from ESLint 8 (end of life) to ESLint 9 with flat config. Affects the build only, not the final image | A03 |
| Info | `DisallowUnknownFields` in the JSON decoder | A05 |

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub: **Security → Report a vulnerability** on this repository.
