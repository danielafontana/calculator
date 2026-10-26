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
// Health checks are not rate limited so probes never get 429.
func NewRouter(h *handlers.Handler, cfg config.Config, logger *slog.Logger) http.Handler {
	limit := middleware.RateLimit(middleware.RateLimitConfig{
		RPS:            cfg.RateLimitRPS,
		Burst:          cfg.RateLimitBurst,
		TrustedProxies: cfg.TrustedProxies,
	})

	mux := http.NewServeMux()
	mux.Handle("POST /api/v1/calculate", limit(middleware.RequireJSON(http.HandlerFunc(h.Calculate))))
	mux.Handle("GET /api/v1/operations", limit(http.HandlerFunc(h.Operations)))
	mux.HandleFunc("GET /api/v1/health", h.Health)

	return middleware.Chain(mux,
		middleware.RequestID,
		middleware.Logger(logger, cfg.TrustedProxies),
		middleware.Recover(logger),
		middleware.CORS(cfg.CORSOrigins),
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
