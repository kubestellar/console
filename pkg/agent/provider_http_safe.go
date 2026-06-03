package agent

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"
)

const (
	providerDNSLookupTimeout = 3 * time.Second
	providerDialTimeout      = 30 * time.Second
)

var lookupProviderIPAddr = net.DefaultResolver.LookupIPAddr

func newSafeAIProviderHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DialContext: safeProviderDialContext,
		},
	}
}

func safeProviderDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}

	lookupCtx := ctx
	cancel := func() {}
	if _, ok := ctx.Deadline(); !ok {
		lookupCtx, cancel = context.WithTimeout(ctx, providerDNSLookupTimeout)
	}
	defer cancel()

	ips, err := lookupProviderIPAddr(lookupCtx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("no IPs resolved for host %s", host)
	}
	if !allowLocalProviders() {
		for _, ip := range ips {
			if isPrivateIP(ip.IP) {
				return nil, fmt.Errorf("blocked: private/internal IP %s for host %s", ip.IP, host)
			}
		}
	}

	dialer := &net.Dialer{Timeout: remainingProviderDialTimeout(ctx)}
	return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
}

func remainingProviderDialTimeout(ctx context.Context) time.Duration {
	if deadline, ok := ctx.Deadline(); ok {
		if remaining := time.Until(deadline); remaining > 0 {
			return remaining
		}
	}
	return providerDialTimeout
}

func pinResolvedProviderRequestHost(req *http.Request) {
	if req == nil || req.URL == nil {
		return
	}
	req.Host = req.URL.Host
}
