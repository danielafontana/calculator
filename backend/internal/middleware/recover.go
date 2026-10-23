package middleware

import (
	"errors"
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/danielafontana/calculator/backend/internal/httpjson"
	"github.com/danielafontana/calculator/backend/internal/models"
)

// Recover turns panics into a 500 JSON response and logs the stack trace.
func Recover(logger *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				rv := recover()
				if rv == nil {
					return
				}

				if err, ok := rv.(error); ok && errors.Is(err, http.ErrAbortHandler) {
					panic(rv)
				}

				logger.ErrorContext(r.Context(), "panic recovered",
					slog.Any("panic", rv),
					slog.String("stack", string(debug.Stack())),
				)
				httpjson.Error(w, http.StatusInternalServerError, models.CodeInternal, "internal server error")
			}()

			next.ServeHTTP(w, r)
		})
	}
}
