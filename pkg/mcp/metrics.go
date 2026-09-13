package mcp

import (
	"sync"

	"github.com/prometheus/client_golang/prometheus"
)

// Bounded client names for the MCP bridge's metric labels — the fixed set of
// subprocess clients Bridge manages (see Start in bridge.go). Never derived
// from user input, so the label set cannot grow.
const (
	ClientOps    = "ops"
	ClientDeploy = "deploy"
	ClientGadget = "gadget"
)

// Bounded result values for mcpToolCallsTotal.
const (
	ResultSuccess = "success"
	ResultError   = "error"
)

var (
	// mcpClientAvailable reports whether each MCP subprocess client is
	// currently started and ready (1) or not (0), mirroring the same
	// booleans already returned by Bridge.Status(). Registered on the
	// default Prometheus registry so it is exposed alongside kc-agent's
	// existing /metrics endpoint (see pkg/agent/workers/prediction_metrics.go)
	// without adding a new HTTP route or dependency.
	mcpClientAvailable = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "console_mcp_client_available",
		Help: "Whether the named MCP bridge client is currently started and ready (1) or not (0).",
	}, []string{"client"})

	// mcpToolCallsTotal counts CallOpsTool/CallDeployTool/CallGadgetTool
	// invocations by client and outcome. "result" is bounded to
	// success|error — never the underlying error string or tool name, so
	// the label set stays fixed regardless of which tools are called.
	mcpToolCallsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "console_mcp_tool_calls_total",
		Help: "Total MCP bridge tool calls, by client and outcome.",
	}, []string{"client", "result"})

	mcpInitOnce sync.Once
)

// InitMetrics registers the MCP bridge's self-observability metrics on the
// default Prometheus registry. Safe to call multiple times.
func InitMetrics() {
	mcpInitOnce.Do(func() {
		prometheus.MustRegister(mcpClientAvailable)
		prometheus.MustRegister(mcpToolCallsTotal)
	})
}

// recordClientAvailable sets the availability gauge for a bounded client name.
func recordClientAvailable(client string, available bool) {
	InitMetrics()
	if available {
		mcpClientAvailable.WithLabelValues(client).Set(1)
	} else {
		mcpClientAvailable.WithLabelValues(client).Set(0)
	}
}

// recordToolCall increments the tool-call counter for a bounded client name
// and outcome.
func recordToolCall(client string, err error) {
	InitMetrics()
	result := ResultSuccess
	if err != nil {
		result = ResultError
	}
	mcpToolCallsTotal.WithLabelValues(client, result).Inc()
}
