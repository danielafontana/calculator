BINARY  := bin/server
VERSION ?= 1.0.0
LDFLAGS := -s -w -X main.version=$(VERSION)

.PHONY: help run build test cover cover-html lint lint-fix fmt tidy docker-build clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

run: ## Run the server locally
	go run ./cmd/server

build: ## Build the server binary into bin/
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o $(BINARY) ./cmd/server

test: ## Run tests with race detector and per-package coverage
	go test -race -cover ./...

cover: ## Generate coverage.out and print total coverage
	go test -race -coverpkg=./internal/... -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out | tail -1

cover-html: cover ## Generate coverage.html
	go tool cover -html=coverage.out -o coverage.html
	@echo "open coverage.html"

lint: ## Run golangci-lint
	golangci-lint run ./...

lint-fix: ## Run golangci-lint with auto-fix
	golangci-lint run --fix ./...

fmt: ## Format code
	golangci-lint fmt ./...

tidy: ## Tidy go.mod/go.sum
	go mod tidy

docker-build: ## Build the Docker image
	docker build --build-arg VERSION=$(VERSION) -t calculator-backend:$(VERSION) .

clean: ## Remove build and coverage artifacts
	rm -rf bin coverage.out coverage.html
