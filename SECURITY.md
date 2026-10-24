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
| **A02** Security Misconfiguration | ✅ / ⚠️ | Security headers on every response; `server_tokens off`; errors never expose internals (Go types, stack traces); backend runs as a non-root user. Open: container hardening |
| **A03** Software Supply Chain Failures | ✅ | Lockfiles (`go.sum`, `package-lock.json`); `go mod verify` and `npm audit signatures`; `govulncheck`, `npm audit` and Trivy (images) in CI, which fails on fixable HIGH or CRITICAL findings; CycloneDX SBOM per build; Dependabot for Go, npm, Docker and Actions; scheduled weekly CI run; latest stable toolchains (Go 1.27, Node 24 LTS) |
| **A04** Cryptographic Failures | ✅ / ⚠️ | TLS 1.2/1.3 only; TLS 1.2 limited to ECDHE + AEAD (no CBC, no static RSA key exchange); TLS 1.3 with hybrid post-quantum key exchange (X25519MLKEM768). Open: a warning when the self-signed certificate is in use (HSTS stays off in that case) |
| **A05** Injection | ✅ | No SQL, shell or server-side templates. JSON decoded into fixed types (`float64`, validated enum); JSON logs (`slog`) prevent log line injection; React escapes all output; CSP without `unsafe-inline` |
| **A06** Insecure Design | ✅ | Validation in both tiers; explicit limits (1 MiB body, 10s timeouts, rate limit); misuse-case tests (overflow, NaN, large body, IP rotation, forged headers) |
| **A07** Authentication Failures | ➖ | Not applicable: the API is public by design. If users are added, use `HttpOnly`/`Secure`/`SameSite` session cookies or OIDC |
| **A08** Software/Data Integrity Failures | ✅ / ⚠️ | Actions pinned by commit SHA; pinned golangci-lint and govulncheck versions; no serialized data accepted without validation. Open: Google Fonts CSS loaded without SRI |
| **A09** Logging & Alerting Failures | ✅ | One JSON log line per request with `request_id`, `client_ip` (real client behind the proxy), status and duration; nginx logs the same `rid`; 4xx at WARN, 5xx and panics at ERROR with stack trace. Alerting depends on the log platform (out of scope) |
| **A10** Mishandling of Exceptional Conditions | ✅ / ⚠️ | Panic recovery with a generic response; fail closed (unknown errors become a detail-free 500); NaN and Inf handled; rate limiter with bounded memory (100,000 clients, ~16 MiB); client and server timeouts. Open: React ErrorBoundary |

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
| Trivy | CI, images | a fixable HIGH or CRITICAL vulnerability exists |
| Smoke test | CI, full stack | a header is missing, a weak cipher is accepted or the backend is exposed |

## Known open items

| Priority | Item | Category |
|---|---|---|
| Medium | Log a warning when the self-signed certificate is used and document a production checklist (HSTS, real certificate) | A04/A02 |
| Low | Containers with `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, and a non-root nginx (`nginx-unprivileged`) | A02 |
| Low | Self-host the fonts: removes Google Fonts from the CSP and from user traffic (privacy) | A08 |
| Low | React ErrorBoundary, so a rendering error does not leave a blank screen | A10 |
| Low | Move from ESLint 8 (end of life) to ESLint 9 with flat config. Affects the build only, not the final image | A03 |
| Info | `DisallowUnknownFields` in the JSON decoder | A05 |

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub: **Security → Report a vulnerability** on this repository.
