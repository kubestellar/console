package api

import (
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"runtime/debug"
	"strings"
)

const (
	defaultDevFrontendURL  = "http://localhost:5174"
	defaultProdFrontendURL = "http://localhost:8080"
	defaultKCAgentBaseURL  = "http://127.0.0.1:8585"
	kcAgentURLEnvVar       = "KC_AGENT_URL"
)

// Version is the build version, injected via ldflags at build time.
// Used in /health response for stale-frontend detection.
var Version = "dev"

// kcAgentBaseURL is the loopback URL of the co-located kc-agent HTTP server.
// The backend proxies auto-update requests to this address so the browser
// never makes a cross-origin call to kc-agent (avoids CORS/PNA issues).
var kcAgentBaseURL = defaultKCAgentBaseURL

// BuildInfo holds VCS metadata extracted from the Go binary at startup.
type BuildInfo struct {
	GoVersion   string
	VCSRevision string
	VCSTime     string
	VCSModified string
}

var buildInfo BuildInfo

// GetBuildInfo returns the VCS metadata extracted from the Go binary.
func GetBuildInfo() BuildInfo { return buildInfo }

func init() {
	kcAgentBaseURL = normalizeKCAgentBaseURL(os.Getenv(kcAgentURLEnvVar))

	info, ok := debug.ReadBuildInfo()
	if !ok {
		return
	}
	buildInfo.GoVersion = info.GoVersion
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			buildInfo.VCSRevision = s.Value
		case "vcs.time":
			buildInfo.VCSTime = s.Value
		case "vcs.modified":
			buildInfo.VCSModified = s.Value
		}
	}
}

// normalizeKCAgentBaseURL validates and normalises the KC_AGENT_URL env var.
// It rejects values that are not valid http/https URLs (scheme+host only) to
// prevent CSP header injection: a value like
//
//	http://evil.com; script-src 'unsafe-inline'
//
// would otherwise be embedded verbatim into the Content-Security-Policy
// connect-src directive (CWE-116 / header injection).  Only the origin
// (scheme://host[:port]) is returned — path, query, and fragment components
// are silently stripped.
func normalizeKCAgentBaseURL(raw string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(raw), "/")
	if trimmed == "" {
		return defaultKCAgentBaseURL
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		slog.Warn(fmt.Sprintf(
			"[Config] KC_AGENT_URL %q is not a valid http/https URL — falling back to default %s",
			trimmed, defaultKCAgentBaseURL,
		))
		return defaultKCAgentBaseURL
	}

	// Reconstruct as origin only (scheme://host) to strip any path/query/
	// fragment that could inject whitespace-separated CSP source expressions.
	origin := fmt.Sprintf("%s://%s", parsed.Scheme, parsed.Host)
	if origin != trimmed {
		slog.Warn(fmt.Sprintf(
			"[Config] KC_AGENT_URL: path/query/fragment stripped — using %q (was %q)",
			origin, trimmed,
		))
	}
	return origin
}

func kcAgentWebSocketBaseURL(httpURL string) string {
	parsedURL, err := url.Parse(httpURL)
	if err != nil {
		return ""
	}

	switch parsedURL.Scheme {
	case "http":
		parsedURL.Scheme = "ws"
	case "https":
		parsedURL.Scheme = "wss"
	}

	return strings.TrimRight(parsedURL.String(), "/")
}
