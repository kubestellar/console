package providers

import (
	"net"
	"os"

	"github.com/kubestellar/console/pkg/ssrf"
)

// isPrivateIP delegates to the shared pkg/ssrf guard (loopback, RFC 1918,
// link-local, CGNAT, cloud metadata, IETF protocol assignments) instead of
// maintaining a local CIDR list, which had drifted out of sync with both
// pkg/ssrf and the sibling copy in pkg/agent/server_ops_validation.go
// (console#24091).
func isPrivateIP(ip net.IP) bool {
	return ssrf.IsBlockedIP(ip)
}

func allowLocalProviders() bool {
	return os.Getenv("ALLOW_LOCAL_PROVIDERS") == "true"
}
