package providers

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/kubestellar/console/pkg/ssrf"
)

// newSafeHTTPClient returns an *http.Client whose Transport resolves DNS at
// connection time and rejects connections to non-public IPs. This prevents
// DNS rebinding / TOCTOU SSRF attacks where a domain passes validation
// pointing to a public IP but is flipped to an internal address before the
// actual HTTP request dials.
func newSafeHTTPClient(timeout time.Duration) *http.Client {
	return newSafeHTTPClientWithValidator(timeout, validatePublicResolvedIP)
}

func newSafeHTTPClientWithValidator(timeout time.Duration, validateResolvedIP func(net.IP) error) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DialContext: safeDialContextWithValidator(timeout, validateResolvedIP),
		},
	}
}

func newOllamaSafeHTTPClient(timeout time.Duration, allowedCIDRs []*net.IPNet) *http.Client {
	return newSafeHTTPClientWithValidator(timeout, validateOllamaResolvedIP(allowedCIDRs))
}

func safeDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	return safeDialContextWithValidator(30*time.Second, validatePublicResolvedIP)(ctx, network, addr)
}

func safeDialContextWithValidator(defaultTimeout time.Duration, validateResolvedIP func(net.IP) error) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
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
			if err := validateResolvedIP(ip.IP); err != nil {
				return nil, err
			}
		}

		dialTimeout := defaultTimeout
		if dl, ok := ctx.Deadline(); ok {
			if remaining := time.Until(dl); remaining > 0 && (dialTimeout <= 0 || remaining < dialTimeout) {
				dialTimeout = remaining
			}
		}
		if dialTimeout <= 0 {
			dialTimeout = 30 * time.Second
		}

		dialer := &net.Dialer{Timeout: dialTimeout, KeepAlive: 30 * time.Second}
		return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}
}

func validatePublicResolvedIP(ip net.IP) error {
	if ssrf.IsBlockedIP(ip) {
		return fmt.Errorf("blocked: non-public IP %s", ip)
	}
	return nil
}

func validateOllamaResolvedIP(allowedCIDRs []*net.IPNet) func(net.IP) error {
	return func(ip net.IP) error {
		if !ipInAllowedCIDRs(ip, allowedCIDRs) {
			return fmt.Errorf("ollama host IP %s not in allowed CIDRs", ip)
		}
		return nil
	}
}

func ipInAllowedCIDRs(ip net.IP, allowedCIDRs []*net.IPNet) bool {
	for _, cidr := range allowedCIDRs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// isBlockedProviderIP returns true if the IP is in a non-public range.
func isBlockedProviderIP(ip net.IP) bool {
	return ssrf.IsBlockedIP(ip)
}
