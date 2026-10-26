// Package httpjson provides helpers to write JSON HTTP responses.
package httpjson

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/danielafontana/calculator/backend/internal/models"
)

// Write serializes v as JSON with the given status code.
func Write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("failed to encode response", "error", err)
	}
}

// Error writes a models.ErrorResponse.
func Error(w http.ResponseWriter, status int, code models.ErrorCode, msg string) {
	Write(w, status, models.ErrorResponse{Error: msg, Code: code})
}
