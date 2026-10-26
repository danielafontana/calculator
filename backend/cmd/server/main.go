// Command server runs the calculator REST API.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/danielafontana/calculator/backend/internal/config"
	"github.com/danielafontana/calculator/backend/internal/handlers"
	"github.com/danielafontana/calculator/backend/internal/server"
	"github.com/danielafontana/calculator/backend/internal/services"
)

// version is set at build time from the backend/vX.Y.Z release tag with
// -ldflags "-X main.version=..."; untagged builds report "dev".
var version = "dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ln, err := new(net.ListenConfig).Listen(ctx, "tcp", ":"+cfg.Port)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	h := handlers.New(services.NewCalculator(), version)

	return server.Run(ctx, ln, server.NewRouter(h, cfg, logger), cfg, logger)
}
