package workers

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Device-tracker scan metrics. DeviceTracker.scanDevices runs on a 60s
// ticker (pkg/agent/workers/workers_device_tracker.go) entirely outside any
// HTTP request path, so it previously had no observability at all: a
// cluster-listing failure or a per-cluster node-fetch failure was only
// visible as a slog line, and there was no way to tell from /metrics alone
// whether the scan loop was still running or how long a scan took. These
// metrics follow the same bounded, self-scrape-only pattern used elsewhere
// in the codebase (see pkg/api/metrics/metrics.go's stellar/gpu sweep
// counters): fixed, small label sets only, no cluster/node identifiers.
var (
	deviceTrackerScanCyclesTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "kc_device_tracker_scan_cycles_total",
			Help: "Total number of completed device-tracker scan cycles.",
		},
	)

	deviceTrackerScanDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "kc_device_tracker_scan_duration_seconds",
			Help:    "Duration of a full device-tracker scan cycle, in seconds.",
			Buckets: prometheus.DefBuckets,
		},
	)

	// stage is a fixed, bounded set ("list_clusters" or "get_nodes"),
	// never a cluster name or other unbounded value.
	deviceTrackerScanErrorsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kc_device_tracker_scan_errors_total",
			Help: "Total device-tracker scan errors, by stage.",
		},
		[]string{"stage"},
	)
)

// recordDeviceTrackerScanCycle records one completed scan cycle's duration.
func recordDeviceTrackerScanCycle(duration time.Duration) {
	deviceTrackerScanCyclesTotal.Inc()
	deviceTrackerScanDuration.Observe(duration.Seconds())
}

// recordDeviceTrackerScanError records a scan error by stage.
func recordDeviceTrackerScanError(stage string) {
	deviceTrackerScanErrorsTotal.WithLabelValues(stage).Inc()
}
