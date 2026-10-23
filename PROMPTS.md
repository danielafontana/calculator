# Prompts usados no desenvolvimento

Este projeto foi desenvolvido com o **Claude Code** (modelo Claude Opus 5.5) na extensão do VS Code, executando os comandos no WSL (Ubuntu 26.04). Abaixo estão os prompts enviados, na ordem, e o que cada um produziu.

## 1. Especificação do projeto

Arquivo anexado com a especificação completa, resumida aqui:

> **Prompt — Calculadora Full-Stack**
>
> Construir aplicação calculadora full-stack. Backend Go expõe REST API. Frontend React+TS consome API. Deploy via Docker Compose. Priorizar arquitetura testável, código idiomático, documentação completa.
>
> - Stack: React 18 + TypeScript 5 + Vite; Go 1.22+ (stdlib net/http); testify; Vitest + React Testing Library; Docker + docker-compose; golangci-lint, ESLint + Prettier.
> - Estrutura de repositório: `backend/{cmd/server, internal/{handlers,services,models,middleware}}`, `frontend/src/{components,hooks,services,types}`.
> - Endpoints: `POST /api/v1/calculate`, `GET /api/v1/health`, `GET /api/v1/operations`.
> - Regras de negócio: add, subtract, multiply, divide (b=0 → `DIVISION_BY_ZERO`), power (infinito → erro), sqrt (a<0 → `NEGATIVE_SQRT`, b ignorado), percentage (`(a*b)/100`).
> - Validações: enum fechado (`INVALID_OPERATION`), body não-JSON (`INVALID_PAYLOAD`), Content-Type ≠ JSON → 415, verificar `math.IsInf`/`math.IsNaN`.
> - Arquitetura: handlers sem lógica; services puros com interface `Calculator`; models com validação via tags; middleware CORS, logger `log/slog`, recover.
> - Testes: table-driven, mock do service nos handlers, cobertura ≥ 85% (Go) e ≥ 80% (TS).
> - Config: `PORT`, `CORS_ORIGINS`, timeouts de 10s, graceful shutdown.
> - Frontend: `<Calculator />`, `<OperationSelector />`, `<ResultDisplay />`, hook `useCalculator`, `api.ts` com `AbortController` (10s) e `ApiError` tipado; validação client-side; mobile-first com breakpoints 480/768/1024; touch targets ≥ 44px.
> - Docker multi-stage para os dois serviços e `docker-compose.yml`.
> - README com 10 seções, Conventional Commits, branches `feature/<nome>`, CI opcional, sentinel errors, discriminated unions, sem `any`.
> - Entregáveis: repositório público, README, coverage, `docker-compose up` funcional, este `PROMPTS.md` e a tag `v1.0.0`.
>
> obs: utilize essa doc como auxiliar para estrutura https://github.com/golang-standards/project-layout/blob/master/README_ptBR.md

Junto com a especificação:

> https://github.com/anthropics/skills instale esses plugins

**Resultado:** o marketplace `anthropics/skills` foi instalado no Claude Code do WSL, com os plugins `document-skills`, `example-skills`, `claude-api`, `academy-guide` e `discernment-nudge`.

## 2. Ambiente

> utilize sempre o WSL para executar comandos, não utilize cmd e powershell, instale coisas apenas no wsl, responda em portugues

**Resultado:** Go, golangci-lint e Node (via nvm) foram instalados no diretório do usuário no WSL, sem `sudo`. O Docker Engine precisa de `sudo`, então ficou como passo manual.

## 3. Início da implementação

> sim, instale no wsl o que for necessário. existe a skill para desenvolvimento em golang nas que você baixou do marketplace?

**Resultado:** não havia skill de Go no marketplace da Anthropic. A implementação começou pelo backend.

## 4. Skills de Go

> https://github.com/samber/cc-skills-golang instale essa skill e me fale como executar ela

**Resultado:** o plugin `cc-skills-golang@samber` foi instalado (marketplace `samber/cc`). Três skills orientaram o backend:

- `golang-lint`: o `.golangci.yml` do backend parte da configuração recomendada pela skill (golangci-lint v2, ~50 linters, gofumpt e goimports). Os `noctx`/`goconst` foram ajustados para arquivos de teste.
- `golang-stretchr-testify`: `require` para pré-condições, `assert` para verificações, ordem `(expected, actual)`, `AssertExpectations` nos mocks, `testifylint`.
- `golang-error-handling`: erros sentinela com `errors.Is`, wrapping com `%w`, mensagens em minúsculas e detalhes internos nunca expostos ao cliente (500 → `internal server error`).

## 5. Interface

A skill `frontend-design` (plugin `example-skills`) guiou o visual. A direção escolhida foi um instrumento de bancada com display LCD reflexivo como único elemento de destaque, teclas com relevo para as operações e uma tecla "=" em âmbar. Ficaram de fora os padrões genéricos que a skill aponta (fundo creme com terracota, preto com verde ácido, cards SaaS idênticos). Os screenshots em `docs/screenshots/` foram gerados com Playwright para revisar o layout em mobile, tablet e desktop. A revisão levou a dois ajustes no mobile: remover espaços vazios do grid e colocar as teclas de operação antes dos campos, já que os rótulos dependem da operação.
