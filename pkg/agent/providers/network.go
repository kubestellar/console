package providers

import (
	"net"
	"os"
)

var privateIPNets = func() []*net.IPNet {
	cidrs := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.0/8",
		"169.254.0.0/16",
		"::1/128",
		"fc00::/7",
	}
	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, cidr := range cidrs {
		_, network, _ := net.ParseCIDR(cidr)
		nets = append(nets, network)
	}
	return nets
}()

func isPrivateIP(ip net.IP) bool {
	if ip.IsUnspecified() {
		return true
	}
	for _, network := range privateIPNets {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func allowLocalProviders() bool {
	return os.Getenv("ALLOW_LOCAL_PROVIDERS") == "true"
}
