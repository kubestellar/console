// Package providers — URL validation for provider base URLs.
// Prevents SSRF attacks by blocking internal/private network addresses.
package providers

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// blockedCIDRs are private/reserved networks that must never be reached
// by user-configured provider base URLs.
var blockedCIDRs = []string{
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"127.0.0.0/8",
	"169.254.0.0/16", // link-local / cloud metadata
	"::1/128",
	"fc00::/7",
	"fe80::/10",
}

var parsedBlockedNets []*net.IPNet

func init() {
	for _, cidr := range blockedCIDRs {
		_, ipNet, err := net.ParseCIDR(cidr)
		if err == nil {
			parsedBlockedNets = append(parsedBlockedNets, ipNet)
		}
	}
}

// ValidateProviderURL checks that a user-supplied provider base URL is safe
// to connect to. It rejects private/internal IPs and non-HTTP(S) schemes.
// For "ollama" providers, http:// to localhost (127.0.0.1) is allowed since
// that is the expected local deployment pattern.
func ValidateProviderURL(rawURL, providerType string) error {
	if rawURL == "" {
		return nil // empty URL means "use default"
	}

	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	// Only allow http/https schemes.
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("unsupported scheme %q: only http and https are allowed", u.Scheme)
	}

	// For cloud providers, require https.
	isLocalProvider := providerType == "ollama" || providerType == "llamacpp" ||
		providerType == "lm-studio" || providerType == "localai" ||
		providerType == "vllm" || providerType == "rhaiis" || providerType == "ramalama"
	if !isLocalProvider && scheme != "https" {
		return fmt.Errorf("cloud provider %q requires https", providerType)
	}

	// Resolve the host to check for private IPs.
	host := u.Hostname()
	ips, err := net.LookupHost(host)
	if err != nil {
		// If we can't resolve, check if it's a raw IP.
		ip := net.ParseIP(host)
		if ip == nil {
			return fmt.Errorf("cannot resolve host %q", host)
		}
		ips = []string{ip.String()}
	}

	for _, ipStr := range ips {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			continue
		}
		// For local providers (ollama etc.), allow loopback only.
		if isLocalProvider && ip.IsLoopback() {
			continue
		}
		for _, blocked := range parsedBlockedNets {
			if blocked.Contains(ip) {
				return fmt.Errorf("URL resolves to blocked network %s (IP: %s)", blocked.String(), ipStr)
			}
		}
	}

	return nil
}
