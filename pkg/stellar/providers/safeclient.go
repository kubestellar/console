package providers

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"
)

// newSafeHTTPClient returns an *http.Client whose Transport resolves DNS at
// connection time and rejects connections to non-public IPs. This prevents
// DNS rebinding / TOCTOU SSRF attacks where a domain passes validation
// pointing to a public IP but is flipped to an internal address before the
// actual HTTP request dials.
func newSafeHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DialContext: safeDialContext,
		},
	}
}

func safeDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("no IPs resolved for host %s", host)
	}
	for _, ip := range ips {
		if isBlockedProviderIP(ip.IP) {
			return nil, fmt.Errorf("blocked: non-public IP %s for host %s", ip.IP, host)
		}
	}
	// Connect to the first validated IP directly — no second DNS lookup
	dialer := &net.Dialer{Timeout: timeout(ctx)}
	return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
}

// isBlockedProviderIP returns true if the IP is in a non-public range.
func isBlockedProviderIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() ||
		providerCGNATNet.Contains(ip) || providerCloudMetadataIP.Contains(ip) ||
		providerIETFProtocolNet.Contains(ip)
}

var (
	_, providerCGNATNet, _          = net.ParseCIDR("100.64.0.0/10")
	_, providerCloudMetadataIP, _   = net.ParseCIDR("169.254.169.254/32")
	_, providerIETFProtocolNet, _   = net.ParseCIDR("192.0.0.0/24")
)

// timeout extracts the remaining context deadline as a dial timeout, falling
// back to 30s.
func timeout(ctx context.Context) time.Duration {
	const defaultDialTimeout = 30 * time.Second
	if dl, ok := ctx.Deadline(); ok {
		if remaining := time.Until(dl); remaining > 0 {
			return remaining
		}
	}
	return defaultDialTimeout
}
