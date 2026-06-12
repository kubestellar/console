package handlers

// NetworkStatsPollIntervalSec is the expected frontend polling interval in seconds.
// Used to estimate per-second rates from cumulative kubelet byte counters.
// Defined here so it can be shared between the handlers and handlers/mcp packages
// without creating an import cycle.
const NetworkStatsPollIntervalSec int64 = 15

// InterfaceStats describes byte-rate counters for a single network interface.
// Defined here so demo data generators in this package and live collectors in
// handlers/mcp can share the same type without creating an import cycle.
type InterfaceStats struct {
	Name          string `json:"name"`
	RxBytes       int64  `json:"rxBytes"`
	TxBytes       int64  `json:"txBytes"`
	RxBytesPerSec int64  `json:"rxBytesPerSec"`
	TxBytesPerSec int64  `json:"txBytesPerSec"`
}

// PodNetworkStats holds the network throughput data for one pod.
type PodNetworkStats struct {
	PodName    string           `json:"podName"`
	Namespace  string           `json:"namespace"`
	Component  string           `json:"component"`
	Interfaces []InterfaceStats `json:"interfaces"`
}
