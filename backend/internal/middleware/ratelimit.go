package middleware

import (
	"math"
	"net/http"
	"net/netip"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/danielafontana/calculator/backend/internal/httpjson"
	"github.com/danielafontana/calculator/backend/internal/models"
)

const (
	defaultClientTTL  = 10 * time.Minute
	defaultMaxClients = 100_000
	// ipv6PrefixBits groups IPv6 clients by /64, the block a single
	// subscriber usually controls; per-address buckets would be trivial to
	// bypass by rotating addresses.
	ipv6PrefixBits = 64
)

// RateLimitConfig configures RateLimit.
type RateLimitConfig struct {
	// RPS is the sustained requests per second per client; <= 0 disables.
	RPS float64
	// Burst is the maximum number of requests allowed at once.
	Burst int
	// TrustedProxies are the peers whose X-Real-IP header is honored.
	TrustedProxies []netip.Prefix
	// ClientTTL is how long an idle client's bucket is kept (default 10m).
	ClientTTL time.Duration
	// MaxClients caps the tracked clients (default 100k, ~16 MiB). Beyond
	// it, new clients share a single overflow bucket.
	MaxClients int
	// Now returns the current time (default time.Now); overridable in tests.
	Now func() time.Time
}

type clientBucket struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// buckets holds one token bucket per client. Idle clients are swept inline,
// at most once per TTL, so no background goroutine is needed. Memory is
// bounded by maxClients.
type buckets struct {
	mu         sync.Mutex
	clients    map[string]*clientBucket
	overflow   *rate.Limiter
	lastSweep  time.Time
	limit      rate.Limit
	burst      int
	ttl        time.Duration
	maxClients int
}

func (b *buckets) allow(key string, now time.Time) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	if now.Sub(b.lastSweep) >= b.ttl {
		b.sweep(now)
	}

	c, ok := b.clients[key]
	if !ok {
		if len(b.clients) >= b.maxClients {
			// Table full (e.g. an address-rotation attack): unknown clients
			// share one bucket, so they are throttled as a group while known
			// clients keep their own allowance.
			return b.overflow.AllowN(now, 1)
		}

		c = &clientBucket{limiter: rate.NewLimiter(b.limit, b.burst)}
		b.clients[key] = c
	}

	c.lastSeen = now

	return c.limiter.AllowN(now, 1)
}

func (b *buckets) sweep(now time.Time) {
	for k, c := range b.clients {
		if now.Sub(c.lastSeen) >= b.ttl {
			delete(b.clients, k)
		}
	}

	b.lastSweep = now
}

// RateLimit limits requests per client with a token bucket and answers
// 429 Too Many Requests (with Retry-After) when the bucket is empty.
func RateLimit(cfg RateLimitConfig) Middleware {
	mw, _ := newRateLimit(cfg)

	return mw
}

func newRateLimit(cfg RateLimitConfig) (Middleware, *buckets) {
	if cfg.RPS <= 0 {
		return func(next http.Handler) http.Handler { return next }, nil
	}

	if cfg.ClientTTL <= 0 {
		cfg.ClientTTL = defaultClientTTL
	}

	if cfg.MaxClients <= 0 {
		cfg.MaxClients = defaultMaxClients
	}

	if cfg.Now == nil {
		cfg.Now = time.Now
	}

	burst := max(cfg.Burst, 1)
	b := &buckets{
		clients:    make(map[string]*clientBucket),
		overflow:   rate.NewLimiter(rate.Limit(cfg.RPS), burst),
		limit:      rate.Limit(cfg.RPS),
		burst:      burst,
		ttl:        cfg.ClientTTL,
		maxClients: cfg.MaxClients,
	}
	retryAfter := strconv.Itoa(int(math.Ceil(1 / cfg.RPS)))

	mw := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := limiterKey(ClientIP(r, cfg.TrustedProxies))
			if !b.allow(key, cfg.Now()) {
				w.Header().Set("Retry-After", retryAfter)
				httpjson.Error(w, http.StatusTooManyRequests, models.CodeRateLimited, "too many requests")

				return
			}

			next.ServeHTTP(w, r)
		})
	}

	return mw, b
}

// limiterKey maps a client IP to its rate limit key: IPv4 addresses are used
// as-is and IPv6 addresses are grouped by their /64 prefix.
func limiterKey(ip string) string {
	addr, err := netip.ParseAddr(ip)
	if err != nil || !addr.Is6() {
		return ip
	}

	prefix, err := addr.Prefix(ipv6PrefixBits)
	if err != nil {
		return ip
	}

	return prefix.String()
}

// ClientIP returns the client address of r. X-Real-IP is honored only when
// the direct peer is a trusted proxy, so clients cannot spoof their address.
func ClientIP(r *http.Request, trusted []netip.Prefix) string {
	peer, err := netip.ParseAddrPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}

	addr := peer.Addr().Unmap()

	if slices.ContainsFunc(trusted, func(p netip.Prefix) bool { return p.Contains(addr) }) {
		if forwarded, err := netip.ParseAddr(strings.TrimSpace(r.Header.Get("X-Real-IP"))); err == nil {
			return forwarded.Unmap().String()
		}
	}

	return addr.String()
}
