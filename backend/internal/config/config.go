// Package config loads server configuration from environment variables.
package config

import (
	"fmt"
	"log/slog"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

// Defaults.
const (
	DefaultPort           = "8080"
	DefaultCORSOrigins    = "http://localhost:3000,http://localhost:5173"
	DefaultRateLimitRPS   = 10
	DefaultRateLimitBurst = 20
)

// Config holds runtime settings.
type Config struct {
	Port            string
	CORSOrigins     []string
	LogLevel        slog.Level
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	ShutdownTimeout time.Duration

	// RateLimitRPS is the sustained number of requests per second allowed per
	// client IP; 0 disables rate limiting. RateLimitBurst is the bucket size.
	RateLimitRPS   float64
	RateLimitBurst int
	// TrustedProxies are the peers allowed to set X-Real-IP (e.g. nginx).
	TrustedProxies []netip.Prefix
}

// Load builds a Config from getenv (usually os.Getenv).
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:            valueOr(getenv("PORT"), DefaultPort),
		CORSOrigins:     splitList(valueOr(getenv("CORS_ORIGINS"), DefaultCORSOrigins)),
		LogLevel:        slog.LevelInfo,
		ReadTimeout:     10 * time.Second,
		WriteTimeout:    10 * time.Second,
		ShutdownTimeout: 10 * time.Second,
		RateLimitRPS:    DefaultRateLimitRPS,
		RateLimitBurst:  DefaultRateLimitBurst,
	}

	if port, err := strconv.Atoi(cfg.Port); err != nil || port < 0 || port > 65535 {
		return Config{}, fmt.Errorf("invalid PORT %q: must be a number between 0 and 65535", cfg.Port)
	}

	if lvl := getenv("LOG_LEVEL"); lvl != "" {
		if err := cfg.LogLevel.UnmarshalText([]byte(lvl)); err != nil {
			return Config{}, fmt.Errorf("invalid LOG_LEVEL %q: %w", lvl, err)
		}
	}

	if err := loadRateLimit(getenv, &cfg); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func loadRateLimit(getenv func(string) string, cfg *Config) error {
	if v := getenv("RATE_LIMIT_RPS"); v != "" {
		rps, err := strconv.ParseFloat(v, 64)
		if err != nil || rps < 0 {
			return fmt.Errorf("invalid RATE_LIMIT_RPS %q: must be a number >= 0", v)
		}

		cfg.RateLimitRPS = rps
	}

	if v := getenv("RATE_LIMIT_BURST"); v != "" {
		burst, err := strconv.Atoi(v)
		if err != nil || burst < 1 {
			return fmt.Errorf("invalid RATE_LIMIT_BURST %q: must be an integer >= 1", v)
		}

		cfg.RateLimitBurst = burst
	}

	proxies, err := parsePrefixes(getenv("TRUSTED_PROXIES"))
	if err != nil {
		return fmt.Errorf("invalid TRUSTED_PROXIES: %w", err)
	}

	cfg.TrustedProxies = proxies

	return nil
}

// parsePrefixes parses a comma-separated list of CIDRs or single IPs.
func parsePrefixes(s string) ([]netip.Prefix, error) {
	var out []netip.Prefix

	for _, item := range splitList(s) {
		if prefix, err := netip.ParsePrefix(item); err == nil {
			out = append(out, prefix.Masked())
			continue
		}

		addr, err := netip.ParseAddr(item)
		if err != nil {
			return nil, fmt.Errorf("%q is not an IP or CIDR", item)
		}

		out = append(out, netip.PrefixFrom(addr, addr.BitLen()))
	}

	return out, nil
}

func valueOr(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}

	return v
}

func splitList(s string) []string {
	var out []string

	for part := range strings.SplitSeq(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}

	return out
}
