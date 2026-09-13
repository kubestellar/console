package watcher

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWatcherMetrics_ExposedOnMetricsHandler(t *testing.T) {
	recordBackendHealthy(true)
	recordFallbackServed()
	recordProxyError(ProxyErrorReasonClientDisconnect)
	recordProxyError(ProxyErrorReasonTimeout)
	recordProxyError(ProxyErrorReasonBackendDown)

	req := httptest.NewRequest("GET", "/watchdog/metrics", nil)
	rec := httptest.NewRecorder()
	MetricsHandler().ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	bodyBytes, err := io.ReadAll(rec.Body)
	if err != nil {
		t.Fatalf("failed to read metrics body: %v", err)
	}
	body := string(bodyBytes)

	for _, want := range []string{
		"console_watcher_backend_healthy 1",
		"console_watcher_fallbacks_served_total 1",
		`console_watcher_proxy_errors_total{reason="client_disconnect"} 1`,
		`console_watcher_proxy_errors_total{reason="timeout"} 1`,
		`console_watcher_proxy_errors_total{reason="backend_down"} 1`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("expected metrics output to contain %q, got:\n%s", want, body)
		}
	}
}

func TestRecordBackendHealthy_TogglesGauge(t *testing.T) {
	recordBackendHealthy(false)
	req := httptest.NewRequest("GET", "/watchdog/metrics", nil)
	rec := httptest.NewRecorder()
	MetricsHandler().ServeHTTP(rec, req)

	bodyBytes, err := io.ReadAll(rec.Body)
	if err != nil {
		t.Fatalf("failed to read metrics body: %v", err)
	}
	if !strings.Contains(string(bodyBytes), "console_watcher_backend_healthy 0") {
		t.Errorf("expected gauge to report 0 after recordBackendHealthy(false), got:\n%s", bodyBytes)
	}
}
