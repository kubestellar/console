package client

import (
"net/http"
"time"
)

// Shared HTTP client pools to avoid creating redundant TCP connection pools.
// Handlers that need custom timeouts should use context.WithTimeout on the request.

// GitHubClient is a shared HTTP client for GitHub API calls.
// Default timeout: 15s (suitable for most GitHub API operations).
var GitHubClient = &http.Client{
Timeout: 15 * time.Second,
}

// ExternalClient is a shared HTTP client for external API calls (YouTube, Medium, etc.).
// Default timeout: 10s.
var ExternalClient = &http.Client{
Timeout: 10 * time.Second,
}

// LongRunningClient is for operations that may take longer (benchmarks, heavy operations).
// Default timeout: 30s.
var LongRunningClient = &http.Client{
Timeout: 30 * time.Second,
}
