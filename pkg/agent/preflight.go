package agent

import (
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"strings"
	"syscall"
	"time"
)

const (
	kubeAPIPreflightTimeout     = 5 * time.Second
	defaultHTTPSAPIServerPort   = "443"
	defaultHTTPAPIServerPort    = "80"
	wslTroubleshootingDoc       = "docs/troubleshooting.md"
	loopbackIPv4Address         = "127.0.0.1"
	loopbackIPv6Address         = "::1"
	loopbackHostname            = "localhost"
)

func runKubeAPIPreflightChecks(kubectl *KubectlProxy) {
	if kubectl == nil {
		return
	}

	clusters, _ := kubectl.ListContexts()
	if len(clusters) == 0 {
		return
	}

	for _, cluster := range clusters {
		apiServerAddress, err := kubeAPIServerDialAddress(cluster.Server)
		if err != nil {
			continue
		}

		conn, dialErr := net.DialTimeout("tcp", apiServerAddress, kubeAPIPreflightTimeout)
		if dialErr == nil {
			_ = conn.Close()
			continue
		}

		guidance := buildKubeAPIPreflightGuidance(apiServerAddress)
		if isConnectionRefusedError(dialErr) || isLoopbackAPIServer(cluster.Server) {
			slog.Error("Failed to connect to Kubernetes API during kc-agent startup",
				"cluster", cluster.Context,
				"apiServer", apiServerAddress,
				"error", dialErr,
				"guidance", guidance,
			)
			continue
		}

		slog.Warn("Kubernetes API pre-flight connectivity check failed",
			"cluster", cluster.Context,
			"apiServer", apiServerAddress,
			"error", dialErr,
		)
	}
}

func buildKubeAPIPreflightGuidance(apiServerAddress string) string {
	return fmt.Sprintf("Failed to connect to Kubernetes API at %s. If running in a hybrid environment (e.g., cluster in WSL2 with agent on Windows), ensure all components run in the same network namespace. See %s for WSL2 setup guidance.", apiServerAddress, wslTroubleshootingDoc)
}

func kubeAPIServerDialAddress(server string) (string, error) {
	trimmedServer := strings.TrimSpace(server)
	if trimmedServer == "" {
		return "", fmt.Errorf("empty Kubernetes API server address")
	}

	parsedServer := trimmedServer
	if !strings.Contains(parsedServer, "://") {
		parsedServer = "https://" + parsedServer
	}

	parsedURL, err := url.Parse(parsedServer)
	if err != nil {
		return "", fmt.Errorf("parse Kubernetes API server %q: %w", trimmedServer, err)
	}

	hostname := parsedURL.Hostname()
	if hostname == "" {
		return "", fmt.Errorf("missing hostname in Kubernetes API server %q", trimmedServer)
	}

	port := parsedURL.Port()
	if port == "" {
		if strings.EqualFold(parsedURL.Scheme, "http") {
			port = defaultHTTPAPIServerPort
		} else {
			port = defaultHTTPSAPIServerPort
		}
	}

	return net.JoinHostPort(hostname, port), nil
}

func isConnectionRefusedError(err error) bool {
	if err == nil {
		return false
	}
	if strings.Contains(strings.ToLower(err.Error()), "connection refused") {
		return true
	}
	if opErr, ok := err.(*net.OpError); ok {
		return opErr.Err != nil && opErr.Err.Error() != "" && strings.Contains(strings.ToLower(opErr.Err.Error()), "connection refused")
	}
	return strings.Contains(strings.ToLower(err.Error()), syscall.ECONNREFUSED.Error())
}

func isLoopbackAPIServer(server string) bool {
	parsedServer := strings.TrimSpace(server)
	if parsedServer == "" {
		return false
	}
	if !strings.Contains(parsedServer, "://") {
		parsedServer = "https://" + parsedServer
	}
	parsedURL, err := url.Parse(parsedServer)
	if err != nil {
		return false
	}
	hostname := strings.ToLower(parsedURL.Hostname())
	return hostname == loopbackHostname || hostname == loopbackIPv4Address || hostname == loopbackIPv6Address
}
