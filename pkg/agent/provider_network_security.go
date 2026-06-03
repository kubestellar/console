package agent

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"
)

const (
	aiProviderDNSLookupTimeout      = 3 * time.Second
	aiProviderValidationHTTPTimeout = 30 * time.Second
	aiProviderPrivateIPError        = "AI provider host resolves to a private/internal IP address"
)

var (
	aiProviderLookupIPAddr = func(ctx context.Context, host string) ([]net.IPAddr, error) {
		return net.DefaultResolver.LookupIPAddr(ctx, host)
	}
	aiProviderDialContextFunc = (&net.Dialer{Timeout: aiProviderHTTPTimeout}).DialContext
	apiKeyValidationClient    = newSecuredAIProviderHTTPClient(allowAIProviderPrivateConnections, aiProviderValidationHTTPTimeout)
)

func allowAIProviderPrivateConnections() bool {
	return allowLocalProviders() || allowLoopbackForTests
}

func resolveAIProviderIPs(ctx context.Context, host string, allowPrivate bool) ([]net.IPAddr, error) {
	if host == "" {
		return nil, fmt.Errorf("base URL must include a host")
	}
	if ip := net.ParseIP(host); ip != nil {
		if !allowPrivate && isPrivateIP(ip) {
			return nil, fmt.Errorf(aiProviderPrivateIPError)
		}
		return []net.IPAddr{{IP: ip}}, nil
	}

	ips, err := aiProviderLookupIPAddr(ctx, host)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve host %q: %w", host, err)
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("host %q resolved to no IP addresses", host)
	}
	if allowPrivate {
		return ips, nil
	}

	for _, ip := range ips {
		if isPrivateIP(ip.IP) {
			return nil, fmt.Errorf("%s: %s", aiProviderPrivateIPError, ip.IP.String())
		}
	}
	return ips, nil
}

func newAIProviderHTTPTransport(allowPrivate func() bool) *http.Transport {
	defaultTransport, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		defaultTransport = &http.Transport{}
	}
	transport := defaultTransport.Clone()
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}

		lookupCtx, cancel := context.WithTimeout(ctx, aiProviderDNSLookupTimeout)
		defer cancel()

		ips, err := resolveAIProviderIPs(lookupCtx, host, allowPrivate())
		if err != nil {
			return nil, err
		}

		return aiProviderDialContextFunc(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}
	return transport
}

func newSecuredAIProviderHTTPClient(allowPrivate func() bool, timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Transport: newAIProviderHTTPTransport(allowPrivate),
	}
}

var (
	aiProviderHTTPClient      = newSecuredAIProviderHTTPClient(allowAIProviderPrivateConnections, aiProviderHTTPTimeout)
	localAIProviderHTTPClient = newSecuredAIProviderHTTPClient(func() bool { return true }, aiProviderHTTPTimeout)
)

func isLocalAIProviderKey(providerKey string) bool {
	switch providerKey {
	case ProviderKeyOllama, ProviderKeyLlamaCpp, ProviderKeyLocalAI, ProviderKeyVLLM, ProviderKeyLMStudio, ProviderKeyRHAIIS, ProviderKeyRamalama, ProviderKeyClaudeDesktopLocal:
		return true
	default:
		return false
	}
}

func aiProviderHTTPClientForProvider(providerKey string) *http.Client {
	if isLocalAIProviderKey(providerKey) {
		return localAIProviderHTTPClient
	}
	return aiProviderHTTPClient
}
