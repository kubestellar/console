package tracing

import (
	"context"
	"os"
	"testing"
)

// TestInitNoopWithoutEndpoint verifies that Init never dials or configures a
// real TracerProvider when OTEL_EXPORTER_OTLP_ENDPOINT is unset — the
// default state for every deployment without an explicitly configured
// tracing backend.
func TestInitNoopWithoutEndpoint(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	os.Unsetenv("OTEL_EXPORTER_OTLP_ENDPOINT")

	shutdown, err := Init(context.Background())
	if err != nil {
		t.Fatalf("Init returned unexpected error: %v", err)
	}
	if shutdown == nil {
		t.Fatal("Init returned a nil Shutdown func; callers rely on unconditionally deferring it")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Errorf("noop shutdown returned unexpected error: %v", err)
	}
}
