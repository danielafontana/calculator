package config_test

import (
	"log/slog"
	"net/netip"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/danielafontana/calculator/backend/internal/config"
)

func env(vars map[string]string) func(string) string {
	return func(k string) string { return vars[k] }
}

func TestLoad_Defaults(t *testing.T) {
	t.Parallel()

	is := assert.New(t)

	cfg, err := config.Load(env(nil))
	require.NoError(t, err)

	is.Equal("8080", cfg.Port)
	is.Equal([]string{"http://localhost:3000", "http://localhost:5173"}, cfg.CORSOrigins)
	is.Equal(slog.LevelInfo, cfg.LogLevel)
	is.Equal(10*time.Second, cfg.ReadTimeout)
	is.Equal(10*time.Second, cfg.WriteTimeout)
	is.Equal(10*time.Second, cfg.ShutdownTimeout)
	is.InDelta(10.0, cfg.RateLimitRPS, 0)
	is.Equal(20, cfg.RateLimitBurst)
	is.Empty(cfg.TrustedProxies)
}

func TestLoad_RateLimitFromEnv(t *testing.T) {
	t.Parallel()

	cfg, err := config.Load(env(map[string]string{
		"RATE_LIMIT_RPS":   "2.5",
		"RATE_LIMIT_BURST": "5",
		"TRUSTED_PROXIES":  "172.16.0.0/12, 10.1.2.3 ,::1,10.0.0.9/8",
	}))
	require.NoError(t, err)

	assert.InDelta(t, 2.5, cfg.RateLimitRPS, 0)
	assert.Equal(t, 5, cfg.RateLimitBurst)
	assert.Equal(t, []netip.Prefix{
		netip.MustParsePrefix("172.16.0.0/12"),
		netip.MustParsePrefix("10.1.2.3/32"),
		netip.MustParsePrefix("::1/128"),
		netip.MustParsePrefix("10.0.0.0/8"),
	}, cfg.TrustedProxies)
}

func TestLoad_RateLimitDisabled(t *testing.T) {
	t.Parallel()

	cfg, err := config.Load(env(map[string]string{"RATE_LIMIT_RPS": "0"}))
	require.NoError(t, err)

	assert.Zero(t, cfg.RateLimitRPS)
}

func TestLoad_FromEnv(t *testing.T) {
	t.Parallel()

	cfg, err := config.Load(env(map[string]string{
		"PORT":         "9090",
		"CORS_ORIGINS": " https://a.test , ,https://b.test ",
		"LOG_LEVEL":    "debug",
	}))
	require.NoError(t, err)

	assert.Equal(t, "9090", cfg.Port)
	assert.Equal(t, []string{"https://a.test", "https://b.test"}, cfg.CORSOrigins)
	assert.Equal(t, slog.LevelDebug, cfg.LogLevel)
}

func TestLoad_Invalid(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		vars map[string]string
		want string
	}{
		{"non numeric port", map[string]string{"PORT": "http"}, "invalid PORT"},
		{"port out of range", map[string]string{"PORT": "70000"}, "invalid PORT"},
		{"negative port", map[string]string{"PORT": "-1"}, "invalid PORT"},
		{"bad log level", map[string]string{"LOG_LEVEL": "loud"}, "invalid LOG_LEVEL"},
		{"non numeric rps", map[string]string{"RATE_LIMIT_RPS": "fast"}, "invalid RATE_LIMIT_RPS"},
		{"negative rps", map[string]string{"RATE_LIMIT_RPS": "-1"}, "invalid RATE_LIMIT_RPS"},
		{"zero burst", map[string]string{"RATE_LIMIT_BURST": "0"}, "invalid RATE_LIMIT_BURST"},
		{"non numeric burst", map[string]string{"RATE_LIMIT_BURST": "x"}, "invalid RATE_LIMIT_BURST"},
		{"bad proxy", map[string]string{"TRUSTED_PROXIES": "10.0.0.0/8,nginx"}, `"nginx" is not an IP or CIDR`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := config.Load(env(tt.vars))
			assert.ErrorContains(t, err, tt.want)
		})
	}
}
