package config_test

import (
	"log/slog"
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := config.Load(env(tt.vars))
			assert.ErrorContains(t, err, tt.want)
		})
	}
}
