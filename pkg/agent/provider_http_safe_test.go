package agent

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestSafeProviderDialContext_BlocksPrivateIPs(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")
	originalLookup := lookupProviderIPAddr
	lookupProviderIPAddr = func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}}, nil
	}
	defer func() { lookupProviderIPAddr = originalLookup }()

	_, err := safeProviderDialContext(context.Background(), "tcp", "example.com:80")
	if err == nil {
		t.Fatal("expected private IP dial to be blocked")
	}
}

func TestSafeAIProviderHTTPClient_PreservesHostHeader(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "true")
	var observedHost string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observedHost = r.Host
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	parsedURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	host := parsedURL.Hostname()
	port := parsedURL.Port()
	ip := net.ParseIP(host)
	if ip == nil {
		t.Fatalf("expected test server host to be an IP, got %q", host)
	}

	originalLookup := lookupProviderIPAddr
	lookupProviderIPAddr = func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: ip}}, nil
	}
	defer func() { lookupProviderIPAddr = originalLookup }()

	client := newSafeAIProviderHTTPClient(aiProviderHTTPTimeout)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://example.com:"+port+"/health", nil)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	pinResolvedProviderRequestHost(req)

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if observedHost != "example.com:"+port {
		t.Fatalf("expected Host header %q, got %q", "example.com:"+port, observedHost)
	}
}
