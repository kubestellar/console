// Package ssrf provides shared SSRF validation helpers that resolve hostnames
// and reject private, loopback, link-local, CGNAT, and cloud-metadata IP
// addresses. Multiple packages in the console backend need this check; keeping
// it here avoids duplicating the logic (and risk of drift) across packages.
package ssrf

import (
	"context"
	"fmt"
	"net"
	"net/http"
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

// resolveSafe resolves host to a single validated IP, rejecting it if any
// resolved address (or the literal itself) falls into a blocked range.
// Returning the specific IP that was checked lets callers dial that exact
// address instead of re-resolving the hostname later.
func resolveSafe(ctx context.Context, host string) (net.IP, error) {
	if host == "" {
		return nil, fmt.Errorf("ssrf: empty hostname")
	}
	if ip := net.ParseIP(host); ip != nil {
		if IsBlockedIP(ip) {
			return nil, fmt.Errorf("ssrf: host %q resolves to blocked IP %s (private/internal address)", host, ip)
		}
		return ip, nil
	}

	lookupCtx, cancel := context.WithTimeout(ctx, dnsTimeout)
	defer cancel()

	ips, err := net.DefaultResolver.LookupIPAddr(lookupCtx, host)
	if err != nil {
		return nil, fmt.Errorf("ssrf: DNS lookup failed for %q — cannot verify safety: %w", host, err)
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("ssrf: DNS lookup for %q returned no addresses", host)
	}
	for _, addr := range ips {
		if IsBlockedIP(addr.IP) {
			return nil, fmt.Errorf("ssrf: host %q resolves to blocked IP %s (private/internal address)", host, addr.IP)
		}
	}
	return ips[0].IP, nil
}

// SafeTransport returns an *http.Transport whose DialContext re-resolves and
// re-validates the destination host immediately before every connection, then
// dials the validated IP address directly (TLS verification still uses the
// original hostname, since only the dial target changes).
//
// This closes the gap left by validating a URL once (e.g. at config-save
// time via ValidateURL) and then reusing an http.Client for requests that
// happen much later: without this, an attacker who controls the destination
// hostname's DNS could pass validation with a public IP and later repoint the
// record at an internal address (DNS rebinding) before the next outbound
// request is actually dialed. Every caller that builds a long-lived
// *http.Client for a user-supplied URL should use this transport rather than
// relying solely on a one-time ValidateURL check.
func SafeTransport() *http.Transport {
	dialer := &net.Dialer{Timeout: dnsTimeout}
	base := http.DefaultTransport.(*http.Transport).Clone()
	base.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("ssrf: invalid dial address %q: %w", addr, err)
		}
		ip, err := resolveSafe(ctx, host)
		if err != nil {
			return nil, err
		}
		return dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
	}
	return base
}
