package gpu

import (
	"context"
	"strings"
	"testing"

	"k8s.io/client-go/rest"
)

// TestScrapeByNamespace_GetOrCreateClientFailure guards the previously
// uncovered `return nil, fmt.Errorf("dcgm: get http client: %w", err)`
// arm of ScrapeByNamespace (scraper.go line ~139).
//
// The only existing test that drives getOrCreateClient into its error
// branch (TestGetOrCreateClient_TransportError) calls the helper
// directly. ScrapeByNamespace's propagation of that error was
// unexercised: a caller-facing regression that turned the wrapped
// "dcgm: get http client" prefix into something else, or dropped the
// error, would have gone unnoticed.
//
// A rest.Config with a CAFile pointing to a nonexistent path forces
// rest.TransportFor to fail. Host must be unique so the cache miss
// path is taken (getOrCreateClient short-circuits when a client for
// the Host is already cached).
func TestScrapeByNamespace_GetOrCreateClientFailure(t *testing.T) {
	cfg := &rest.Config{
		Host: "https://scrape-transport-error.invalid.test",
		TLSClientConfig: rest.TLSClientConfig{
			CAFile: "/nonexistent/path/to/ca.crt",
		},
	}
	_, err := ScrapeByNamespace(context.Background(), cfg, ScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	if err == nil {
		t.Fatal("expected getOrCreateClient error to propagate, got nil")
	}
	if !strings.Contains(err.Error(), "dcgm: get http client") {
		t.Errorf("expected 'dcgm: get http client' prefix in error, got %v", err)
	}
}

// TestScrapeByNamespace_BuildRequestFailure guards the previously
// uncovered `return nil, fmt.Errorf("dcgm: build request: %w", err)`
// arm of ScrapeByNamespace (scraper.go line ~152).
//
// http.NewRequestWithContext parses the URL and rejects control
// characters in the host portion. Passing a Host containing a raw
// newline forces the underlying url.Parse to return an error, which
// ScrapeByNamespace must wrap with the "dcgm: build request" prefix.
// scrape.Namespace/scrape.Service are DNS1123-validated before
// reaching this point, so config.Host is the only carrier of URL-
// unsafe bytes.
func TestScrapeByNamespace_BuildRequestFailure(t *testing.T) {
	// Newline in the Host is unambiguously invalid for
	// http.NewRequestWithContext's URL parser, and different enough
	// from every existing Host in the cache (127.0.0.1:1,
	// "http://unused", the transport-error host above) that it takes
	// the cache-miss / TransportFor path first. Give it a plain HTTP
	// scheme so TransportFor succeeds and the failure surfaces at the
	// NewRequestWithContext call.
	cfg := &rest.Config{Host: "http://build-request-error\nhost"}
	_, err := ScrapeByNamespace(context.Background(), cfg, ScrapeConfig{
		Namespace: "gpu-operator",
		Service:   "dcgm-exporter",
	})
	if err == nil {
		t.Fatal("expected build-request error for Host with control char, got nil")
	}
	if !strings.Contains(err.Error(), "dcgm: build request") {
		t.Errorf("expected 'dcgm: build request' prefix in error, got %v", err)
	}
}
