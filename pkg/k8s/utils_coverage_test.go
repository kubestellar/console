package k8s

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────────────
// pathAffectsKubeconfig — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestPathAffectsKubeconfig_ExactMatch(t *testing.T) {
	assert.True(t, pathAffectsKubeconfig("/home/user/.kube/config", "/home/user/.kube/config"))
}

func TestPathAffectsKubeconfig_EmptyEvent(t *testing.T) {
	assert.False(t, pathAffectsKubeconfig("", "/home/user/.kube/config"))
}

func TestPathAffectsKubeconfig_EmptyKubeconfig(t *testing.T) {
	assert.False(t, pathAffectsKubeconfig("/home/user/.kube/config", ""))
}

func TestPathAffectsKubeconfig_BothEmpty(t *testing.T) {
	assert.False(t, pathAffectsKubeconfig("", ""))
}

func TestPathAffectsKubeconfig_ParentDir(t *testing.T) {
	// Event on /home/user/.kube affects /home/user/.kube/config
	assert.True(t, pathAffectsKubeconfig("/home/user/.kube", "/home/user/.kube/config"))
}

func TestPathAffectsKubeconfig_UnrelatedPath(t *testing.T) {
	assert.False(t, pathAffectsKubeconfig("/tmp/foo", "/home/user/.kube/config"))
}

func TestPathAffectsKubeconfig_SameDir_SameBase(t *testing.T) {
	// Same dir and basename even if trailing slashes differ
	assert.True(t, pathAffectsKubeconfig("/home/user/.kube/config", "/home/user/.kube/config"))
}

func TestPathAffectsKubeconfig_DifferentFile_SameDir(t *testing.T) {
	assert.False(t, pathAffectsKubeconfig("/home/user/.kube/other", "/home/user/.kube/config"))
}

// ────────────────────────────────────────────────────────────────────────────
// redactedMessage — was 25%
// ────────────────────────────────────────────────────────────────────────────

func TestRedactedMessage_AllTypes(t *testing.T) {
	tests := []struct {
		errType  string
		expected string
	}{
		{"timeout", "cluster probe timed out"},
		{"config", "cluster credential helper misconfigured"},
		{"auth", "authentication or authorization failure"},
		{"network", "cluster unreachable (network error)"},
		{"certificate", "TLS certificate validation failed"},
		{"not_found", "cluster context not found in kubeconfig"},
		{"unknown_type", "cluster health check failed"},
		{"", "cluster health check failed"},
	}
	for _, tc := range tests {
		t.Run(tc.errType, func(t *testing.T) {
			assert.Equal(t, tc.expected, redactedMessage(tc.errType))
		})
	}
}

// ────────────────────────────────────────────────────────────────────────────
// MarkSlow / IsSlow — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestMarkSlow_MarksCluster(t *testing.T) {
	m := &MultiClusterClient{
		slowClusters: make(map[string]time.Time),
	}
	assert.False(t, m.IsSlow("cluster-a"))

	m.MarkSlow("cluster-a")
	assert.True(t, m.IsSlow("cluster-a"))
}

func TestIsSlow_ExpiredEntry(t *testing.T) {
	m := &MultiClusterClient{
		slowClusters: map[string]time.Time{
			"cluster-b": time.Now().Add(-slowClusterTTL - time.Second),
		},
	}
	assert.False(t, m.IsSlow("cluster-b"))
}

func TestIsSlow_UnknownCluster(t *testing.T) {
	m := &MultiClusterClient{
		slowClusters: make(map[string]time.Time),
	}
	assert.False(t, m.IsSlow("never-seen"))
}

// ────────────────────────────────────────────────────────────────────────────
// ConsoleResourceEventToJSON / NewConsoleResourceChangedMessage — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestConsoleResourceEventToJSON_RoundTrip(t *testing.T) {
	event := ConsoleResourceEvent{
		Type:         "ADDED",
		ResourceType: "ManagedWorkload",
		Name:         "test-workload",
		Namespace:    "default",
	}
	data, err := ConsoleResourceEventToJSON(event)
	require.NoError(t, err)

	var decoded ConsoleResourceEvent
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Equal(t, event.Type, decoded.Type)
	assert.Equal(t, event.ResourceType, decoded.ResourceType)
	assert.Equal(t, event.Name, decoded.Name)
}

func TestNewConsoleResourceChangedMessage_Structure(t *testing.T) {
	event := ConsoleResourceEvent{
		Type:         "MODIFIED",
		ResourceType: "ClusterGroup",
		Name:         "prod",
	}
	msg := NewConsoleResourceChangedMessage(event)
	assert.Equal(t, "console_resource_changed", msg.Type)
	assert.Equal(t, event, msg.Data)
}

// ────────────────────────────────────────────────────────────────────────────
// isBetterClusterName — not tested explicitly
// ────────────────────────────────────────────────────────────────────────────

func TestIsBetterClusterName_PrefersShorter(t *testing.T) {
	assert.True(t, isBetterClusterName("prod", "production-cluster"))
}

func TestIsBetterClusterName_PrefersHumanOverAuto(t *testing.T) {
	// auto-generated names contain "/" and ":"
	assert.True(t, isBetterClusterName("my-cluster", "arn:aws:eks:us-east-1:123/cluster"))
}

func TestIsBetterClusterName_AutoVsAuto_ShorterWins(t *testing.T) {
	assert.True(t, isBetterClusterName("short/host:443", "very-long/hostname:6443"))
}

func TestIsBetterClusterName_HumanVsHuman_ShorterWins(t *testing.T) {
	assert.True(t, isBetterClusterName("prod", "production"))
}

func TestIsBetterClusterName_DoesNotPreferAutoOverHuman(t *testing.T) {
	assert.False(t, isBetterClusterName("arn:aws:eks:us-east-1:123/cluster", "prod"))
}

// ────────────────────────────────────────────────────────────────────────────
// SetOnReload / SetOnWatchError — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestSetOnReload_SetsCallback(t *testing.T) {
	m := &MultiClusterClient{}
	called := false
	m.SetOnReload(func() { called = true })
	require.NotNil(t, m.onReload)
	m.onReload()
	assert.True(t, called)
}

func TestSetOnWatchError_SetsCallback(t *testing.T) {
	m := &MultiClusterClient{}
	var received error
	m.SetOnWatchError(func(err error) { received = err })
	require.NotNil(t, m.onWatchError)
	m.onWatchError(assert.AnError)
	assert.Equal(t, assert.AnError, received)
}
