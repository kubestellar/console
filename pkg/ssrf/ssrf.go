// Package ssrf provides shared SSRF validation helpers that resolve hostnames
// and reject private, loopback, link-local, CGNAT, and cloud-metadata IP
// addresses. Multiple packages in the console backend need this check; keeping
// it here avoids duplicating the logic (and risk of drift) across packages.
package ssrf

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"time"
)

var (
	// cgnatNet is RFC 6598 Carrier-Grade NAT (100.64.0.0/10).
	_, cgnatNet, _ = net.ParseCIDR("100.64.0.0/10")
	// cloudMetadataNet is the well-known cloud instance metadata IP.
	_, cloudMetadataNet, _ = net.ParseCIDR("169.254.169.254/32")
	// ietfProtocolNet is IETF protocol assignments (192.0.0.0/24).
	_, ietfProtocolNet, _ = net.ParseCIDR("192.0.0.0/24")
)

// dnsTimeout bounds hostname resolution so a slow resolver cannot block the
// caller indefinitely.
const dnsTimeout = 3 * time.Second

// IsBlockedIP returns true if ip falls into any range that should not be
// contacted by server-side requests (loopback, private RFC 1918, link-local,
// CGNAT, cloud metadata, IETF protocol assignments).
func IsBlockedIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() ||
		cgnatNet.Contains(ip) || cloudMetadataNet.Contains(ip) || ietfProtocolNet.Contains(ip)
}

// ValidateHost resolves the given hostname (or IP literal) and returns an error
// if any resolved address falls into a blocked range. This prevents SSRF by
// ensuring outbound connections cannot reach internal infrastructure.
//
// The check is fail-closed: if DNS resolution fails the host is rejected.
func ValidateHost(host string) error {
	if host == "" {
		return fmt.Errorf("ssrf: empty hostname")
	}

	// Fast path: if it's already an IP literal, check directly.
	if ip := net.ParseIP(host); ip != nil {
		if IsBlockedIP(ip) {
			return fmt.Errorf("ssrf: host %q resolves to blocked IP %s (private/internal address)", host, ip)
		}
		return nil
	}

	// Resolve the hostname.
	ctx, cancel := context.WithTimeout(context.Background(), dnsTimeout)
	defer cancel()

	ips, err := net.DefaultResolver.LookupHost(ctx, host)
	if err != nil {
		// Fail closed: unresolvable host could be a DNS rebinding setup.
		return fmt.Errorf("ssrf: DNS lookup failed for %q — cannot verify safety: %w", host, err)
	}
	for _, ipStr := range ips {
		if ip := net.ParseIP(ipStr); ip != nil && IsBlockedIP(ip) {
			return fmt.Errorf("ssrf: host %q resolves to blocked IP %s (private/internal address)", host, ip)
		}
	}
	return nil
}

// ValidateURL parses a URL string, extracts the hostname, and validates it
// against blocked IP ranges. Returns an error if the URL is malformed or the
// host resolves to a private/internal address.
func ValidateURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("ssrf: invalid URL: %w", err)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("ssrf: URL %q has no host", rawURL)
	}
	return ValidateHost(host)
}
