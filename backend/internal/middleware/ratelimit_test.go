package middleware_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/danielafontana/calculator/backend/internal/middleware"
	"github.com/danielafontana/calculator/backend/internal/models"
)

type fakeClock struct{ now time.Time }

func (c *fakeClock) Now() time.Time          { return c.now }
func (c *fakeClock) Advance(d time.Duration) { c.now = c.now.Add(d) }
func newClock() *fakeClock                   { return &fakeClock{now: time.Unix(1_700_000_000, 0)} }
func request(remote string) *http.Request    { return requestWithRealIP(remote, "") }
func requestWithRealIP(remote, realIP string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = remote

	if realIP != "" {
		r.Header.Set("X-Real-IP", realIP)
	}

	return r
}

func serve(h http.Handler, r *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)

	return rec
}

func TestRateLimit_Disabled(t *testing.T) {
	t.Parallel()

	h := middleware.RateLimit(middleware.RateLimitConfig{RPS: 0, Burst: 1})(okHandler)

	for range 50 {
		assert.Equal(t, http.StatusOK, serve(h, request("10.0.0.1:1234")).Code)
	}
}

func TestRateLimit_BurstThenRefill(t *testing.T) {
	t.Parallel()

	must := require.New(t)
	clock := newClock()
	h := middleware.RateLimit(middleware.RateLimitConfig{RPS: 1, Burst: 2, Now: clock.Now})(okHandler)

	must.Equal(http.StatusOK, serve(h, request("10.0.0.1:1")).Code)
	must.Equal(http.StatusOK, serve(h, request("10.0.0.1:2")).Code)

	rec := serve(h, request("10.0.0.1:3"))
	must.Equal(http.StatusTooManyRequests, rec.Code)
	assert.Equal(t, "1", rec.Header().Get("Retry-After"))

	var body models.ErrorResponse
	must.NoError(json.Unmarshal(rec.Body.Bytes(), &body))
	assert.Equal(t, models.ErrorResponse{Error: "too many requests", Code: models.CodeRateLimited}, body)

	clock.Advance(time.Second)
	assert.Equal(t, http.StatusOK, serve(h, request("10.0.0.1:4")).Code, "one token refills per second")
	assert.Equal(t, http.StatusTooManyRequests, serve(h, request("10.0.0.1:5")).Code)
}

func TestRateLimit_RetryAfterRoundsUp(t *testing.T) {
	t.Parallel()

	h := middleware.RateLimit(middleware.RateLimitConfig{RPS: 0.25, Burst: 1, Now: newClock().Now})(okHandler)

	serve(h, request("10.0.0.1:1"))
	assert.Equal(t, "4", serve(h, request("10.0.0.1:1")).Header().Get("Retry-After"))
}

func TestRateLimit_PerClient(t *testing.T) {
	t.Parallel()

	h := middleware.RateLimit(middleware.RateLimitConfig{RPS: 1, Burst: 1, Now: newClock().Now})(okHandler)

	assert.Equal(t, http.StatusOK, serve(h, request("10.0.0.1:1")).Code)
	assert.Equal(t, http.StatusTooManyRequests, serve(h, request("10.0.0.1:2")).Code)
	assert.Equal(t, http.StatusOK, serve(h, request("10.0.0.2:1")).Code, "other clients keep their own bucket")
}

func TestRateLimit_TrustedProxy(t *testing.T) {
	t.Parallel()

	trusted := []netip.Prefix{netip.MustParsePrefix("172.16.0.0/12")}
	h := middleware.RateLimit(middleware.RateLimitConfig{
		RPS: 1, Burst: 1, TrustedProxies: trusted, Now: newClock().Now,
	})(okHandler)

	// Behind the proxy, each real client gets its own bucket.
	assert.Equal(t, http.StatusOK, serve(h, requestWithRealIP("172.18.0.5:1", "203.0.113.1")).Code)
	assert.Equal(t, http.StatusOK, serve(h, requestWithRealIP("172.18.0.5:2", "203.0.113.2")).Code)
	assert.Equal(t, http.StatusTooManyRequests, serve(h, requestWithRealIP("172.18.0.5:3", "203.0.113.1")).Code)

	// A direct client cannot dodge the limit by forging X-Real-IP.
	assert.Equal(t, http.StatusOK, serve(h, requestWithRealIP("198.51.100.7:1", "1.1.1.1")).Code)
	assert.Equal(t, http.StatusTooManyRequests, serve(h, requestWithRealIP("198.51.100.7:2", "2.2.2.2")).Code)
}

func TestRateLimit_SweepsIdleClients(t *testing.T) {
	t.Parallel()

	clock := newClock()
	mw, store := middleware.NewRateLimit(middleware.RateLimitConfig{
		RPS: 1, Burst: 1, ClientTTL: time.Minute, Now: clock.Now,
	})
	h := mw(okHandler)

	serve(h, request("10.0.0.1:1"))
	serve(h, request("10.0.0.2:1"))
	require.Equal(t, 2, store.Size())

	clock.Advance(2 * time.Minute)
	serve(h, request("10.0.0.3:1"))

	assert.Equal(t, 1, store.Size(), "idle clients are forgotten")
}

func TestRateLimit_Concurrent(t *testing.T) {
	t.Parallel()

	const burst = 25

	h := middleware.RateLimit(middleware.RateLimitConfig{RPS: 0.001, Burst: burst})(okHandler)

	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		allowed int
	)

	for range 100 {
		wg.Go(func() {
			if serve(h, request("10.0.0.1:1")).Code == http.StatusOK {
				mu.Lock()
				allowed++
				mu.Unlock()
			}
		})
	}

	wg.Wait()
	assert.Equal(t, burst, allowed)
}

func TestClientIP(t *testing.T) {
	t.Parallel()

	trusted := []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8"), netip.MustParsePrefix("::1/128")}

	tests := []struct {
		name, remote, realIP, want string
	}{
		{"direct client", "198.51.100.7:5000", "", "198.51.100.7"},
		{"header ignored from untrusted peer", "198.51.100.7:5000", "1.2.3.4", "198.51.100.7"},
		{"header honored from trusted proxy", "10.1.2.3:5000", "203.0.113.9", "203.0.113.9"},
		{"trusted IPv6 proxy", "[::1]:5000", "2001:db8::1", "2001:db8::1"},
		{"invalid header falls back to peer", "10.1.2.3:5000", "not-an-ip", "10.1.2.3"},
		{"IPv4-mapped peer is unmapped", "[::ffff:198.51.100.7]:5000", "", "198.51.100.7"},
		{"unparsable remote address", "pipe", "", "pipe"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, middleware.ClientIP(requestWithRealIP(tt.remote, tt.realIP), trusted))
		})
	}
}
