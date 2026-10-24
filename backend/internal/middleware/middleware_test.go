package middleware_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/danielafontana/calculator/backend/internal/middleware"
	"github.com/danielafontana/calculator/backend/internal/models"
)

var okHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
	_, _ = io.WriteString(w, "ok")
})

func TestCORS(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		allowed     []string
		method      string
		origin      string
		preflight   bool
		wantStatus  int
		wantAllowed string
	}{
		{"allowed origin", []string{"http://a.test"}, http.MethodGet, "http://a.test", false, http.StatusOK, "http://a.test"},
		{"disallowed origin", []string{"http://a.test"}, http.MethodGet, "http://b.test", false, http.StatusOK, ""},
		{"no origin header", []string{"http://a.test"}, http.MethodGet, "", false, http.StatusOK, ""},
		{"wildcard", []string{"*"}, http.MethodGet, "http://any.test", false, http.StatusOK, "*"},
		{"preflight", []string{"http://a.test"}, http.MethodOptions, "http://a.test", true, http.StatusNoContent, "http://a.test"},
		{"plain OPTIONS passes through", []string{"http://a.test"}, http.MethodOptions, "", false, http.StatusOK, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(tt.method, "/", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			if tt.preflight {
				req.Header.Set("Access-Control-Request-Method", http.MethodPost)
			}

			rec := httptest.NewRecorder()
			middleware.CORS(tt.allowed)(okHandler).ServeHTTP(rec, req)

			assert.Equal(t, tt.wantStatus, rec.Code)
			assert.Equal(t, tt.wantAllowed, rec.Header().Get("Access-Control-Allow-Origin"))
			assert.Equal(t, "Origin", rec.Header().Get("Vary"))

			if tt.wantAllowed != "" {
				assert.Contains(t, rec.Header().Get("Access-Control-Allow-Methods"), http.MethodPost)
			}
		})
	}
}

func TestLogger(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		handler   http.HandlerFunc
		wantLevel string
		wantCode  int
	}{
		{"implicit 200", func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "ok") }, "INFO", http.StatusOK},
		{"no body", func(http.ResponseWriter, *http.Request) {}, "INFO", http.StatusOK},
		{"client error", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusBadRequest) }, "WARN", http.StatusBadRequest},
		{"server error", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusBadGateway) }, "ERROR", http.StatusBadGateway},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var buf bytes.Buffer

			logger := slog.New(slog.NewJSONHandler(&buf, nil))
			rec := httptest.NewRecorder()
			middleware.Logger(logger, nil)(tt.handler).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))

			var entry map[string]any
			require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
			assert.Equal(t, "http request", entry["msg"])
			assert.Equal(t, tt.wantLevel, entry["level"])
			assert.Equal(t, http.MethodGet, entry["method"])
			assert.Equal(t, "/x", entry["path"])
			assert.InDelta(t, float64(tt.wantCode), entry["status"], 0)
			assert.Contains(t, entry, "duration")
		})
	}
}

func TestRecover(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer

	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	panicking := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("kaboom") })

	rec := httptest.NewRecorder()
	middleware.Recover(logger)(panicking).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	assert.JSONEq(t, `{"error":"internal server error","code":"INTERNAL_ERROR"}`, rec.Body.String())
	assert.Contains(t, buf.String(), "kaboom")
	assert.Contains(t, buf.String(), "stack")
}

func TestRecover_NoPanic(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	middleware.Recover(slog.New(slog.DiscardHandler))(okHandler).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "ok", rec.Body.String())
}

func TestRecover_RepanicsAbortHandler(t *testing.T) {
	t.Parallel()

	aborting := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) })
	h := middleware.Recover(slog.New(slog.DiscardHandler))(aborting)

	assert.PanicsWithError(t, http.ErrAbortHandler.Error(), func() {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
	})
}

func TestRequireJSON(t *testing.T) {
	t.Parallel()

	tests := []struct {
		contentType string
		wantStatus  int
	}{
		{"application/json", http.StatusOK},
		{"application/json; charset=utf-8", http.StatusOK},
		{"Application/JSON", http.StatusOK},
		{"text/plain", http.StatusUnsupportedMediaType},
		{"application/x-www-form-urlencoded", http.StatusUnsupportedMediaType},
		{"", http.StatusUnsupportedMediaType},
		{";;invalid", http.StatusUnsupportedMediaType},
	}

	for _, tt := range tests {
		t.Run(tt.contentType, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodPost, "/", nil)
			req.Header.Set("Content-Type", tt.contentType)

			rec := httptest.NewRecorder()
			middleware.RequireJSON(okHandler).ServeHTTP(rec, req)

			assert.Equal(t, tt.wantStatus, rec.Code)

			if tt.wantStatus == http.StatusUnsupportedMediaType {
				var resp models.ErrorResponse
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
				assert.Equal(t, models.CodeUnsupportedMediaType, resp.Code)
			}
		})
	}
}

func TestChain_Order(t *testing.T) {
	t.Parallel()

	var order []string

	mw := func(name string) middleware.Middleware {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				order = append(order, name)

				next.ServeHTTP(w, r)
			})
		}
	}

	middleware.Chain(okHandler, mw("first"), mw("second")).
		ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	assert.Equal(t, []string{"first", "second"}, order)
}

func TestLogger_ClientIPAndRequestID(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer

	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	trusted := []netip.Prefix{netip.MustParsePrefix("172.16.0.0/12")}
	h := middleware.RequestID(middleware.Logger(logger, trusted)(okHandler))

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.RemoteAddr = "172.18.0.3:4000"
	req.Header.Set("X-Real-IP", "203.0.113.7")
	req.Header.Set(middleware.RequestIDHeader, "abc-123")
	h.ServeHTTP(httptest.NewRecorder(), req)

	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	assert.Equal(t, "203.0.113.7", entry["client_ip"], "real client behind the trusted proxy")
	assert.Equal(t, "172.18.0.3:4000", entry["remote_addr"])
	assert.Equal(t, "abc-123", entry["request_id"])
}

func TestRequestID(t *testing.T) {
	t.Parallel()

	var seen string

	h := middleware.RequestID(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen = middleware.RequestIDFrom(r.Context())
	}))

	tests := []struct {
		name, incoming string
		keep           bool
	}{
		{"propagates a valid id", "3f2a9c1e-77b0", true},
		{"generates when missing", "", false},
		{"replaces ids with unsafe characters", "abc\ninjected", false},
		{"replaces oversized ids", strings.Repeat("a", 65), false},
	}

	for _, tt := range tests {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if tt.incoming != "" {
			req.Header.Set(middleware.RequestIDHeader, tt.incoming)
		}

		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		got := rec.Header().Get(middleware.RequestIDHeader)
		assert.Equal(t, seen, got, tt.name)

		if tt.keep {
			assert.Equal(t, tt.incoming, got, tt.name)
		} else {
			assert.Regexp(t, `^[0-9a-f]{32}$`, got, tt.name)
		}
	}

	assert.Empty(t, middleware.RequestIDFrom(t.Context()))
}
