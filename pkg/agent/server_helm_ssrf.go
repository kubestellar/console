package agent

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"
)

// validateHelmOCIChartRef performs SSRF protection on OCI chart references
// (e.g. oci://registry.io/chart:version). It extracts the hostname from the
// OCI URI and validates that it does not resolve to a private/internal IP,
// preventing authenticated users from using the helm binary to probe internal
// cluster services (CWE-918).
//
// This mirrors the protection already applied to AI provider URLs via
// validateBaseURL in server_ops_validation.go. See #17530.
func validateHelmOCIChartRef(chart string) error {
	if !strings.HasPrefix(chart, "oci://") {
		return nil // only OCI references need URL-level SSRF checks
	}

	if allowLocalProviders() {
		return nil // development mode — skip network restrictions
	}

	u, err := url.Parse(chart)
	if err != nil {
		return fmt.Errorf("invalid OCI chart reference: %w", err)
	}
	if u.Host == "" {
		return fmt.Errorf("OCI chart reference must include a registry host; got %q", chart)
	}

	hostname := u.Hostname()

	// If the host is an IP literal, check directly.
	if ip := net.ParseIP(hostname); ip != nil {
		if isPrivateIP(ip) {
			return fmt.Errorf("OCI chart registry %q uses a private/internal IP address", hostname)
		}
		return nil
	}

	// Resolve hostname and validate all IPs against the blocklist.
	const ociDNSLookupTimeout = 3 * time.Second
	lookupCtx, cancel := context.WithTimeout(context.Background(), ociDNSLookupTimeout)
	defer cancel()

	ips, err := net.DefaultResolver.LookupHost(lookupCtx, hostname)
	if err != nil {
		// Fail closed — if we can't resolve, block it to prevent DNS rebinding.
		return fmt.Errorf("DNS lookup failed for OCI registry %q — cannot verify safety: %w", hostname, err)
	}
	for _, ipStr := range ips {
		if ip := net.ParseIP(ipStr); ip != nil && isPrivateIP(ip) {
			return fmt.Errorf("OCI chart registry %q resolves to private/internal IP %s", hostname, ipStr)
		}
	}
	return nil
}
