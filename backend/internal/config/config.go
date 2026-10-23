// Package config loads server configuration from environment variables.
package config

import (
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"
)

// Defaults.
const (
	DefaultPort        = "8080"
	DefaultCORSOrigins = "http://localhost:3000,http://localhost:5173"
)

// Config holds runtime settings.
type Config struct {
	Port            string
	CORSOrigins     []string
	LogLevel        slog.Level
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	ShutdownTimeout time.Duration
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
	}

	if port, err := strconv.Atoi(cfg.Port); err != nil || port < 0 || port > 65535 {
		return Config{}, fmt.Errorf("invalid PORT %q: must be a number between 0 and 65535", cfg.Port)
	}

	if lvl := getenv("LOG_LEVEL"); lvl != "" {
		if err := cfg.LogLevel.UnmarshalText([]byte(lvl)); err != nil {
			return Config{}, fmt.Errorf("invalid LOG_LEVEL %q: %w", lvl, err)
		}
	}

	return cfg, nil
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
