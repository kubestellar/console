package agent

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const testAIProviderHTTPTimeout = 2 * time.Second

func TestRestrictedAIProviderHTTPClientBlocksPrivateTargets(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")

	// Temporarily disable the test loopback bypass so we can verify
	// that the SSRF protection actually blocks private IPs.
	allowLoopbackForTests = false
	t.Cleanup(func() { allowLoopbackForTests = true })

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("request should have been blocked before reaching the server")
	}))
	defer server.Close()

	client := newRestrictedAIProviderHTTPClient(testAIProviderHTTPTimeout)
	resp, err := client.Get(server.URL)
	if err == nil {
		defer resp.Body.Close()
		t.Fatal("expected request to be blocked")
	}
	if !strings.Contains(err.Error(), "private/internal IP") {
		t.Fatalf("expected private IP error, got %v", err)
	}
}

func TestRestrictedAIProviderHTTPClientAllowsLocalTargetsWhenEnabled(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")

	const expectedBody = "ok"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, expectedBody)
	}))
	defer server.Close()

	client := newRestrictedAIProviderHTTPClient(testAIProviderHTTPTimeout)
	resp, err := client.Get(server.URL)
	if err != nil {
		t.Fatalf("expected local provider request to succeed: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}
	if string(body) != expectedBody {
		t.Fatalf("unexpected response body %q", string(body))
	}
}

func TestRestrictedAIProviderHTTPClientDoesNotFollowRedirects(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")

	var hits int32
	const redirectTarget = "https://example.com/final"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		http.Redirect(w, r, redirectTarget, http.StatusFound)
	}))
	defer server.Close()

	client := newRestrictedAIProviderHTTPClient(testAIProviderHTTPTimeout)
	resp, err := client.Get(server.URL)
	if err != nil {
		t.Fatalf("expected redirect response without client error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusFound {
		t.Fatalf("expected status %d, got %d", http.StatusFound, resp.StatusCode)
	}
	if location := resp.Header.Get("Location"); location != redirectTarget {
		t.Fatalf("expected redirect target %q, got %q", redirectTarget, location)
	}
	if gotHits := atomic.LoadInt32(&hits); gotHits != 1 {
		t.Fatalf("expected one request before redirect was stopped, got %d", gotHits)
	}
}
