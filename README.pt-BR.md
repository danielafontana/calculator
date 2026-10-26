# Calculadora Full-Stack

[English](README.md) | Português

Uma calculadora com API REST em **Go** e frontend em **React + TypeScript**, executada com **Docker Compose**.

```bash
docker compose up --build -d     # depois abra http://localhost:3000
```

## 1. Visão geral

Sete operações: soma, subtração, multiplicação, divisão, potência, raiz quadrada e porcentagem. O frontend é um teclado de calculadora convencional (dígitos de 0 a 9 e teclas de função só com ícones) que funciona com mouse, toque e teclado físico. Todo cálculo é feito pela API, e erros como divisão por zero, raiz de número negativo ou overflow são explicados no display.

| Desktop (≥ 1024px) | Tablet (≥ 768px) | Celular (< 480px) |
|:---:|:---:|:---:|
| <img src="docs/screenshots/desktop.png" alt="Desktop: 2 ^ 10 = 1,024" height="380"> | <img src="docs/screenshots/tablet-sqrt.png" alt="Tablet: 12 + raiz quadrada de 9, com o + pendente destacado" height="380"> | <img src="docs/screenshots/mobile-error.png" alt="Celular: erro de divisão por zero" height="380"> |
| `2 ^ 10 =` | `12 + √(9)`, com `+` pendente | divisão por zero |

**Teclado:** `0`–`9`, `.` ou `,` (decimal), `+` `-` `*` `/`, `^` (potência), `%`, `@` (√x), `q` (x²), `F9` (±), `Enter`/`=`, `Backspace`, `Delete` (CE), `Esc` (C).

Também neste repositório: [SECURITY.md](SECURITY.md) (revisão OWASP Top 10:2025), [PROMPTS.md](PROMPTS.md) (prompts utilizados) e uma [collection do Postman](postman/). A interface da aplicação e os demais documentos estão em inglês.

## 2. Arquitetura

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

| Caminho | Conteúdo |
|---|---|
| `backend/cmd/server` | inicialização: configuração, logger, sinais, listener |
| `backend/internal/` | `handlers` (só HTTP), `services` (regras de cálculo), `models` (tipos e validação), `middleware`, `config`, `server` (rotas, desligamento gracioso) |
| `frontend/src/` | `components` (Calculator, ResultDisplay, Keypad), `hooks` (useKeypad, useCalculator, useOperations), `services/api.ts`, `utils/keypad.ts` (máquina de estados pura) |
| `frontend/nginx/` | templates do nginx: TLS, proxy de `/api`, headers de segurança |
| `postman/` | collection e environment da API |

O backend segue o [golang-standards/project-layout](https://github.com/golang-standards/project-layout/blob/master/README_ptBR.md).

## 3. Pré-requisitos

- **Para executar:** [Docker](https://docs.docker.com/engine/install/) com Compose v2.
- **Para desenvolver:** [Go 1.27](https://go.dev/dl/) e [Node.js 24 LTS](https://nodejs.org/) (24.15+; o `nvm use` lê o `frontend/.nvmrc`). Opcional: [golangci-lint v2](https://golangci-lint.run/) e `make`.

## 4. Início rápido

```bash
git clone https://github.com/danielafontana/calculator-go.git
cd calculator-go
docker compose up --build -d
```

- Aplicação: **<http://localhost:3000>**. API na mesma origem: <http://localhost:3000/api/v1/health>.
- HTTPS: <https://localhost:3443>, com certificado autoassinado gerado na inicialização (o navegador mostra um aviso na primeira visita).
- Para parar: `docker compose down`. Todas as configurações, comentadas, estão no [`.env.example`](.env.example) (copie para `.env` para alterá-las).

### Checklist de produção

1. `HTTP_MODE=redirect` (padrão da imagem), para que o HTTP redirecione para HTTPS.
2. Monte um certificado real em `/etc/nginx/certs` (`fullchain.pem`, `privkey.pem`) descomentando o volume no `docker-compose.yml`. Sem ele, o container registra um aviso no log.
3. `HSTS_MAX_AGE=31536000`, somente com certificado real.
4. `HTTP_PORT=80` e `HTTPS_PORT=443`.

## 5. Desenvolvimento

Rode cada parte num terminal próprio, começando pelo backend: o servidor de desenvolvimento do frontend repassa o `/api` para ele.

```bash
# backend (porta 8080)
cd backend && go run ./cmd/server

# frontend (porta 5173; repassa /api para localhost:8080)
cd frontend && nvm use && npm install && npm run dev -- --host 127.0.0.1
```

| | Backend | Frontend |
|---|---|---|
| Lint | `make lint` | `npm run lint` |
| Formatação | `make fmt` | `npm run format` |
| Build | `make build` | `npm run build` |

**Versionamento e releases.** Backend e frontend são versionados e lançados de forma independente e compartilham apenas o contrato `/api/v1` (qualquer frontend 1.x funciona com qualquer backend 1.x).

| | Backend | Frontend |
|---|---|---|
| Tag | `backend/vX.Y.Z` | `frontend/vX.Y.Z` (deve bater com o `package.json`) |
| Imagem | `ghcr.io/<owner>/calculator-backend` | `ghcr.io/<owner>/calculator-frontend` |
| Versão em execução | `GET /api/v1/health` | `GET /version.json` |

O push da tag de um componente roda de novo as verificações de CI, escaneia a imagem com o Trivy, publica no GHCR com SBOM e proveniência, assina com cosign e cria uma release no GitHub. A tag do projeto `vX.Y.Z` marca um par entregue. Para implantar um único componente, defina a imagem e a tag dele e recrie só aquele serviço:

```bash
BACKEND_IMAGE=ghcr.io/<owner>/calculator-backend BACKEND_TAG=1.1.0 \
  docker compose up -d --no-build --pull always backend
```

## 6. Exemplos de API

| Método | Caminho | Descrição |
|---|---|---|
| `POST` | `/api/v1/calculate` | Corpo `{"operation", "a", "b"}`; `operation` é `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt` ou `percentage`; `sqrt` ignora `b` |
| `GET` | `/api/v1/operations` | Operações suportadas, com símbolo e descrição |
| `GET` | `/api/v1/health` | `{"status":"ok","version":"..."}` |

Os exemplos de `curl` usam sintaxe de bash (Linux, macOS, WSL ou Git Bash); no cmd ou no PowerShell do Windows, use a collection do Postman abaixo.

```bash
curl -s -X POST http://localhost:3000/api/v1/calculate \
  -H 'Content-Type: application/json' -d '{"operation":"add","a":10,"b":5}'
# {"result":15,"operation":"add","operands":{"a":10,"b":5}}

curl -s -X POST http://localhost:3000/api/v1/calculate \
  -H 'Content-Type: application/json' -d '{"operation":"divide","a":10,"b":0}'
# {"error":"division by zero","code":"DIVISION_BY_ZERO"}
```

**Postman.** Importe [`postman/calculator.postman_collection.json`](postman/calculator.postman_collection.json) e [`postman/calculator-local.postman_environment.json`](postman/calculator-local.postman_environment.json) e selecione o environment **Calculator - Local**. A collection cobre todas as operações e os casos de erro, com testes em cada requisição. Ela também roda pela linha de comando:

```bash
npx newman run postman/calculator.postman_collection.json -e postman/calculator-local.postman_environment.json
```

O `baseUrl` é `http://localhost:3000` (Docker); use `http://localhost:8080` ao rodar o backend com `go run`.

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | Corpo vazio, JSON inválido ou campo com tipo errado |
| 400 | `INVALID_OPERATION` | `operation` ausente ou não suportada |
| 400 | `MISSING_OPERAND` | `a` ausente, ou `b` ausente numa operação binária |
| 400 | `DIVISION_BY_ZERO` | `divide` com `b = 0`, ou `power` com `a = 0` e `b < 0` |
| 400 | `NEGATIVE_SQRT` | `sqrt` com `a < 0` |
| 400 | `OVERFLOW` / `UNDEFINED_RESULT` | Resultado infinito / `NaN` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` diferente de `application/json` |
| 429 | `RATE_LIMITED` | Mais de 10 req/s por cliente (rajada de 20); veja o `Retry-After` |
| 500 | `INTERNAL_ERROR` | Erro inesperado; os detalhes vão para o log, nunca para a resposta |

## 7. Testes

```bash
cd backend && go test -race -cover ./...       # make cover-html gera coverage.html
cd frontend && npm run test -- --coverage      # relatório HTML em coverage/index.html
```

| Camada | Meta | Atual |
|---|---|---|
| Backend (statements) | ≥ 85% | 98,3% |
| Frontend (statements) | ≥ 80% | 99,6% (89 testes) |

O CI é dividido por componente: `backend.yml` e `frontend.yml` (lint, scans de vulnerabilidade, testes com relatórios de cobertura como artefatos, build da imagem + Trivy) rodam só quando o respectivo diretório muda, o `stack.yml` faz o smoke test da stack completa e os workflows de release rodam nas tags. O Dependabot mantém dependências, imagens e Actions atualizadas.

## 8. Decisões de design

- **Camadas handler/service.** O service não conhece HTTP: as regras de negócio são testadas sem servidor, e os handlers são testados com um mock da interface `Calculator`. Os erros sentinela são mapeados para status HTTP e `code` numa única tabela.
- **Stateless.** Sem sessão nem banco: o backend escala horizontalmente (`docker compose up -d --scale backend=3`) e reinicia sem perder nada.
- **float64, não um tipo decimal.** É o número nativo do JSON e do JavaScript, então os dois lados concordam sem conversão. O custo é a imprecisão decimal (`0.1 + 0.2`), escondida pela formatação com até 10 casas. Um tipo decimal exigiria números como string no JSON e ainda assim não representaria raízes com exatidão; seria a escolha para valores monetários.
- **Teclado como máquina de estados pura** (`utils/keypad.ts`). Toda sequência de teclas é testada sem React nem rede; os componentes só renderizam.
- **CSS Modules, não Tailwind.** Escopo pequeno e visual específico: escopo local sem runtime e design tokens em variáveis CSS.
- **Origem única via nginx.** A SPA e o `/api` ficam na mesma origem, então o frontend não precisa de CORS e o backend nunca é exposto. TLS, headers de segurança, rate limiting e logs estão descritos no [SECURITY.md](SECURITY.md).
- **Preparado para escalar.** O nginx mantém conexões persistentes com o backend, reconsulta as réplicas a cada 10 s e repete em outra réplica as requisições sem efeitos colaterais; os containers têm limites de CPU e memória. Medido numa única máquina, com 100 conexões: cerca de 47.000 req/s só no backend Go e 7.400 req/s através do nginx com TLS, com 1 CPU por container. O nginx satura primeiro, então `FRONTEND_CPUS` é o primeiro ajuste a aumentar.

## 9. Premissas

- Operandos e resultados precisam caber em float64; a precisão é de cerca de 15 a 17 dígitos significativos.
- Os números são digitados no teclado da calculadora (até 16 dígitos) e exibidos no formato en-US (`1,234.5`).
- A porcentagem segue a API: `200 % 15 =` é 15% de 200.
- Sem persistência e sem autenticação; os nomes das operações diferenciam maiúsculas de minúsculas.
- O corpo das requisições é limitado a 1 MiB; o rate limit padrão é de 10 req/s por cliente, compartilhado atrás de um NAT.
- O ambiente local serve HTTP na porta 3000 e um certificado autoassinado na 3443; produção segue o [checklist](#checklist-de-produção).

## 10. Melhorias futuras

- Autenticação (cookies de sessão ou OIDC) quando houver usuários.
- Rate limiting compartilhado (Redis) entre as réplicas do backend.
- Histórico de cálculos com persistência.
- Expressões completas (`2 * (3 + 4)`) com um parser.
- Precisão arbitrária opcional, para uso financeiro.
- Métricas (Prometheus) e tracing (OpenTelemetry).
- Especificação OpenAPI e testes end-to-end com Playwright.
