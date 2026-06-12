package handlers

// ClusterError represents a per-cluster failure in a multi-cluster request (#4758).
// Included in the response so the frontend can distinguish "no resources" from
// "cluster failed" and display an appropriate degraded-state indicator.
type ClusterError struct {
	Cluster   string `json:"cluster"`
	ErrorType string `json:"errorType"`
	Message   string `json:"message"`
}

// NetworkStatsPollIntervalSec is the expected frontend polling interval in seconds.
// Used to estimate per-second rates from cumulative kubelet byte counters.
const NetworkStatsPollIntervalSec int64 = 15

// InterfaceStats describes byte-rate counters for a single network interface.
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
