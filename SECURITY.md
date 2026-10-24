# Segurança

Este documento mapeia os controles do projeto para o [OWASP Top 10:2025](https://owasp.org/Top10/2025/) e registra o que ainda está pendente. Última revisão: 2026-10-24.

## Visão geral

A calculadora é uma API pública e stateless. Não há usuários, sessões, banco de dados nem dados pessoais armazenados. A superfície de ataque é composta por:

- o nginx, que termina o TLS, serve a SPA e faz proxy de `/api`;
- três endpoints JSON no backend Go.

Os riscos principais são abuso (negação de serviço), configuração de transporte e cadeia de suprimentos.

## Controles por categoria

| Categoria | Status | Controles |
|---|---|---|
| **A01** Broken Access Control | ✅ | Não há recursos privados. Rotas com método fixo (405 para os demais); backend fora da internet (só na rede interna do Docker); CORS restrito a origens configuradas; nginx sem listagem de diretórios e sem arquivos de controle no web root |
| **A02** Security Misconfiguration | ✅ / ⚠️ | Headers de segurança em todas as respostas; `server_tokens off`; erros sem detalhes internos (tipos do Go, stack); backend como usuário não-root. Pendente: hardening dos containers |
| **A03** Software Supply Chain Failures | ✅ | Lockfiles (`go.sum`, `package-lock.json`); `go mod verify` e `npm audit signatures`; `govulncheck`, `npm audit` e Trivy (imagens) no CI, que falha com HIGH ou CRITICAL corrigível; SBOM CycloneDX por build; Dependabot para Go, npm, Docker e Actions; CI semanal agendado |
| **A04** Cryptographic Failures | ✅ / ⚠️ | TLS 1.2/1.3 apenas; TLS 1.2 restrito a ECDHE + AEAD (sem CBC, sem troca de chave RSA estática); TLS 1.3 com troca de chave híbrida pós-quântica (X25519MLKEM768). Pendente: aviso quando o certificado autoassinado é usado (HSTS fica desligado nesse caso) |
| **A05** Injection | ✅ | Não há SQL, shell nem templates no servidor. JSON decodificado em tipos fixos (`float64`, enum validado); logs em JSON (`slog`), o que impede injeção de linhas; o React escapa toda saída; CSP sem `unsafe-inline` |
| **A06** Insecure Design | ✅ | Validação nas duas camadas; limites explícitos (corpo de 1 MiB, timeouts de 10s, rate limit); testes de casos de abuso (overflow, NaN, corpo grande, rotação de IP, cabeçalho forjado) |
| **A07** Authentication Failures | ➖ | Não se aplica: a API é pública por design. Se houver usuários, a recomendação é sessão em cookie `HttpOnly`/`Secure`/`SameSite` ou OIDC |
| **A08** Software/Data Integrity Failures | ✅ / ⚠️ | Actions fixadas por SHA; versões fixas de golangci-lint e govulncheck; nenhum dado serializado é aceito sem validação. Pendente: CSS do Google Fonts sem SRI |
| **A09** Logging & Alerting Failures | ✅ | Log JSON por requisição com `request_id`, `client_ip` (IP real atrás do proxy), status e duração; o nginx registra o mesmo `rid`; 4xx em WARN e 5xx/panic em ERROR com stack. Alertas dependem da plataforma de logs (fora do escopo) |
| **A10** Mishandling of Exceptional Conditions | ✅ / ⚠️ | Recover de panic com resposta genérica; falha fechada (erro desconhecido vira 500 sem detalhes); NaN e Inf tratados; rate limit com memória limitada (100 mil clientes, ~16 MiB); timeouts no cliente e no servidor. Pendente: ErrorBoundary no React |

## Rate limiting

- Token bucket por cliente: 10 req/s com rajada de 20 (`RATE_LIMIT_RPS`, `RATE_LIMIT_BURST`). Aplicado a `/calculate` e `/operations`, mas não ao `/health`.
- **IPv6 agrupado por /64.** Um único assinante controla um /64 inteiro; com um bucket por endereço, bastaria rotacionar endereços para nunca ser limitado.
- **Memória limitada.** No máximo 100 mil clientes rastreados. Acima disso, clientes novos dividem um bucket de transbordo: um ataque com rotação de IPs é contido como grupo, e os clientes já conhecidos mantêm a própria cota.
- **Origem do IP.** O `X-Real-IP` só é aceito de peers em `TRUSTED_PROXIES`, então um cliente direto não consegue forjar o próprio IP.
- **Limitação:** o estado fica em memória, por instância. Com várias réplicas, é preciso um store compartilhado (Redis).

## Verificações automatizadas

| Ferramenta | Onde | Falha o build quando |
|---|---|---|
| golangci-lint (inclui `gosec`) | CI, backend | há qualquer achado |
| `govulncheck` | CI, backend | há vulnerabilidade alcançável |
| `npm audit` | CI, frontend | há vulnerabilidade HIGH ou mais grave |
| `npm audit signatures` | CI, frontend | há assinatura de pacote inválida |
| Trivy | CI, imagens | há HIGH ou CRITICAL com correção disponível |
| Smoke test | CI, stack completa | falta header, uma cifra fraca é aceita ou o backend está exposto |

## Pendências conhecidas

| Prioridade | Item | Categoria |
|---|---|---|
| Média | Registrar aviso ao usar o certificado autoassinado e documentar um checklist de produção (HSTS, certificado real) | A04/A02 |
| Baixa | Containers com `read_only`, `cap_drop: [ALL]`, `no-new-privileges` e nginx sem root (`nginx-unprivileged`) | A02 |
| Baixa | Servir as fontes localmente: remove o Google Fonts da CSP e do tráfego (LGPD) | A08 |
| Baixa | ErrorBoundary no React, para não deixar a tela em branco em erro de renderização | A10 |
| Baixa | Migrar do ESLint 8 (fora de suporte) para o ESLint 9 com flat config. Só afeta o build, não a imagem final | A03 |
| Info | `DisallowUnknownFields` no decoder JSON | A05 |

## Como reportar uma vulnerabilidade

Não abra issue pública. Reporte de forma privada pelo GitHub: **Security → Report a vulnerability** neste repositório.
