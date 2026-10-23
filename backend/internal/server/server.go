// Package server wires routes and middlewares and runs the HTTP server
// with graceful shutdown.
package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/danielafontana/calculator/backend/internal/config"
	"github.com/danielafontana/calculator/backend/internal/handlers"
	"github.com/danielafontana/calculator/backend/internal/middleware"
)

// NewRouter registers the API routes and wraps them with the middleware stack.
func NewRouter(h *handlers.Handler, corsOrigins []string, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("POST /api/v1/calculate", middleware.RequireJSON(http.HandlerFunc(h.Calculate)))
	mux.HandleFunc("GET /api/v1/health", h.Health)
	mux.HandleFunc("GET /api/v1/operations", h.Operations)

	return middleware.Chain(mux,
		middleware.Logger(logger),
		middleware.Recover(logger),
		middleware.CORS(corsOrigins),
	)
}

// Run serves handler on ln until ctx is cancelled, then shuts down
// gracefully, waiting at most cfg.ShutdownTimeout for in-flight requests.
func Run(ctx context.Context, ln net.Listener, handler http.Handler, cfg config.Config, logger *slog.Logger) error {
	srv := &http.Server{
		Handler:           handler,
		ReadTimeout:       cfg.ReadTimeout,
		ReadHeaderTimeout: cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       60 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}

	errCh := make(chan error, 1)
	go func() { errCh <- srv.Serve(ln) }()

	logger.Info("server started", slog.String("addr", ln.Addr().String()))

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}

		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
	}

	logger.Info("shutting down server")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}

	logger.Info("server stopped")

	return nil
}
