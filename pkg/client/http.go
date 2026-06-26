// Package client provides shared HTTP clients with connection pooling.
//
// Handlers should use these clients instead of creating their own
// &http.Client{} instances to benefit from shared TCP connection pools
// and consistent configuration. For per-request timeout control, use
// context.WithTimeout on the request rather than a separate client.
//
// Handlers with custom Transport settings (SSRF-protection dial hooks,
// TLS config, redirect policies) should keep their own clients.
package client

import (
	"net"
	"net/http"
	"time"
)

// Shared transport with tuned connection pool settings.
// All simple clients share this transport for TCP connection reuse.
var sharedTransport = &http.Transport{
	DialContext:         (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
	MaxIdleConns:        100,
	MaxConnsPerHost:     10,
	IdleConnTimeout:     90 * time.Second,
	TLSHandshakeTimeout: 10 * time.Second,
}

// GitHub is a shared HTTP client for GitHub API calls (10s timeout).
// Used by: auth, feedback_config, feedback_requests, agentic_detection_runs,
// github_pipelines, github_proxy, github_app_auth.
var GitHub = &http.Client{
	Timeout:   15 * time.Second,
	Transport: sharedTransport,
}

// External is a shared HTTP client for external API calls (30s timeout).
// Used by: missions, rewards, benchmarks, nightly_e2e, acmm_scan.
var External = &http.Client{
	Timeout:   30 * time.Second,
	Transport: sharedTransport,
}

// Short is a shared HTTP client for lightweight/fast calls (10s timeout).
// Used by: youtube, medium, analytics_proxy, kubara_catalog, manifest.
var Short = &http.Client{
	Timeout:   10 * time.Second,
	Transport: sharedTransport,
}
