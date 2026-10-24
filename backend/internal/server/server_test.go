package server_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/danielafontana/calculator/backend/internal/config"
	"github.com/danielafontana/calculator/backend/internal/handlers"
	"github.com/danielafontana/calculator/backend/internal/server"
	"github.com/danielafontana/calculator/backend/internal/services"
)

func newRouter() http.Handler {
	h := handlers.New(services.NewCalculator(), "1.0.0")

	return server.NewRouter(h, config.Config{CORSOrigins: []string{"http://localhost:3000"}}, slog.New(slog.DiscardHandler))
}

// TestRouter exercises the full stack: router, middlewares, handlers and the
// real calculator service.
func TestRouter(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		method      string
		path        string
		contentType string
		body        string
		wantStatus  int
		wantBody    string
	}{
		{
			"calculate add", http.MethodPost, "/api/v1/calculate", "application/json", `{"operation":"add","a":10,"b":5}`, http.StatusOK,
			`{"result":15,"operation":"add","operands":{"a":10,"b":5}}`,
		},
		{
			"calculate sqrt", http.MethodPost, "/api/v1/calculate", "application/json", `{"operation":"sqrt","a":2.25}`, http.StatusOK,
			`{"result":1.5,"operation":"sqrt","operands":{"a":2.25}}`,
		},
		{
			"division by zero", http.MethodPost, "/api/v1/calculate", "application/json", `{"operation":"divide","a":1,"b":0}`, http.StatusBadRequest,
			`{"error":"division by zero","code":"DIVISION_BY_ZERO"}`,
		},
		{
			"negative sqrt", http.MethodPost, "/api/v1/calculate", "application/json", `{"operation":"sqrt","a":-4}`, http.StatusBadRequest,
			`{"error":"square root of a negative number","code":"NEGATIVE_SQRT"}`,
		},
		{
			"wrong content type", http.MethodPost, "/api/v1/calculate", "text/plain", `{}`, http.StatusUnsupportedMediaType,
			`{"error":"Content-Type must be application/json","code":"UNSUPPORTED_MEDIA_TYPE"}`,
		},
		{"health", http.MethodGet, "/api/v1/health", "", "", http.StatusOK, `{"status":"ok","version":"1.0.0"}`},
	}

	router := newRouter()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			if tt.contentType != "" {
				req.Header.Set("Content-Type", tt.contentType)
			}

			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			assert.Equal(t, tt.wantStatus, rec.Code)
			assert.JSONEq(t, tt.wantBody, rec.Body.String())
		})
	}
}

func TestRouter_Operations(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	newRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/operations", nil))

	require.Equal(t, http.StatusOK, rec.Code)

	var body struct {
		Operations []struct {
			Name string `json:"name"`
		} `json:"operations"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Len(t, body.Operations, 7)
}

func TestRouter_MethodNotAllowed(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	newRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/calculate", nil))

	assert.Equal(t, http.StatusMethodNotAllowed, rec.Code)
}

func TestRouter_Preflight(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/calculate", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)

	rec := httptest.NewRecorder()
	newRouter().ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, "http://localhost:3000", rec.Header().Get("Access-Control-Allow-Origin"))
}

func TestRouter_RateLimit(t *testing.T) {
	t.Parallel()

	h := handlers.New(services.NewCalculator(), "1.0.0")
	router := server.NewRouter(h, config.Config{RateLimitRPS: 0.001, RateLimitBurst: 2}, slog.New(slog.DiscardHandler))

	calculate := func() int {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/calculate",
			strings.NewReader(`{"operation":"add","a":1,"b":2}`))
		req.Header.Set("Content-Type", "application/json")

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		return rec.Code
	}
	get := func(path string) int {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))

		return rec.Code
	}

	assert.Equal(t, http.StatusOK, calculate())
	assert.Equal(t, http.StatusOK, get("/api/v1/operations"))
	assert.Equal(t, http.StatusTooManyRequests, calculate(), "calculate and operations share the client bucket")
	assert.Equal(t, http.StatusTooManyRequests, get("/api/v1/operations"))
	assert.Equal(t, http.StatusOK, get("/api/v1/health"), "health checks are never rate limited")
}

func testConfig() config.Config {
	return config.Config{
		ReadTimeout:     time.Second,
		WriteTimeout:    time.Second,
		ShutdownTimeout: time.Second,
	}
}

func TestRun_ServesAndShutsDownGracefully(t *testing.T) {
	t.Parallel()

	must := require.New(t)

	ln, err := new(net.ListenConfig).Listen(t.Context(), "tcp", "127.0.0.1:0")
	must.NoError(err)

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)

	go func() { done <- server.Run(ctx, ln, newRouter(), testConfig(), slog.New(slog.DiscardHandler)) }()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+ln.Addr().String()+"/api/v1/health", nil)
	must.NoError(err)

	resp, err := http.DefaultClient.Do(req)
	must.NoError(err)

	body, err := io.ReadAll(resp.Body)
	must.NoError(resp.Body.Close())
	must.NoError(err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.JSONEq(t, `{"status":"ok","version":"1.0.0"}`, string(body))

	cancel()

	select {
	case err := <-done:
		must.NoError(err)
	case <-time.After(5 * time.Second):
		t.Fatal("server did not shut down in time")
	}
}

func TestRun_ServeError(t *testing.T) {
	t.Parallel()

	ln, err := new(net.ListenConfig).Listen(t.Context(), "tcp", "127.0.0.1:0")
	require.NoError(t, err)
	require.NoError(t, ln.Close()) // Serve fails immediately on a closed listener

	err = server.Run(t.Context(), ln, newRouter(), testConfig(), slog.New(slog.DiscardHandler))
	assert.ErrorContains(t, err, "serve")
}
