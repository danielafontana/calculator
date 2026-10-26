package middleware

import (
	"mime"
	"net/http"

	"github.com/danielafontana/calculator/backend/internal/httpjson"
	"github.com/danielafontana/calculator/backend/internal/models"
)

// RequireJSON rejects requests whose Content-Type is not application/json
// with 415 Unsupported Media Type.
func RequireJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || mediaType != "application/json" {
			httpjson.Error(w, http.StatusUnsupportedMediaType, models.CodeUnsupportedMediaType,
				"Content-Type must be application/json")

			return
		}

		next.ServeHTTP(w, r)
	})
}
