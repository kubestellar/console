package stellar

import (
	"testing"

	"github.com/kubestellar/console/pkg/stellar"
	"github.com/stretchr/testify/assert"
)

// ---------- classifyEvent ----------

func TestClassifyEvent_NoiseReasons(t *testing.T) {
	noiseList := []string{
		"Pulling", "Pulled", "Created", "Started", "Scheduled",
		"SuccessfulCreate", "ScalingReplicaSet", "SuccessfulDelete",
		"NoPods", "SuccessfulRescale",
	}
	for _, reason := range noiseList {
		t.Run(reason, func(t *testing.T) {
			e := IncomingEvent{Reason: reason, Type: "Normal"}
			sev, isNoise := classifyEvent(e)
			assert.True(t, isNoise, "expected %q to be noise", reason)
			assert.Empty(t, sev)
		})
	}
}

func TestClassifyEvent_Critical(t *testing.T) {
	criticals := []string{
		"CrashLoopBackOff", "OOMKilling", "OOMKilled", "BackOff",
		"Evicted", "NodeNotReady", "FailedScheduling", "FailedMount",
	}
	for _, reason := range criticals {
		t.Run(reason, func(t *testing.T) {
			e := IncomingEvent{Reason: reason, Type: "Warning"}
			sev, isNoise := classifyEvent(e)
			assert.False(t, isNoise)
			assert.Equal(t, "critical", sev)
		})
	}
}

func TestClassifyEvent_WarningNonCritical(t *testing.T) {
	e := IncomingEvent{Reason: "SomeCustomWarning", Type: "Warning"}
	sev, isNoise := classifyEvent(e)
	assert.False(t, isNoise)
	assert.Equal(t, "warning", sev)
}

func TestClassifyEvent_NormalNonNoiseIsNoise(t *testing.T) {
	// Normal events that aren't in the noise list but also not Warning → noise
	e := IncomingEvent{Reason: "SomeNormalEvent", Type: "Normal"}
	_, isNoise := classifyEvent(e)
	assert.True(t, isNoise)
}

// ---------- narrateEventFast ----------

func TestNarrateEventFast_CrashLoopBackOff(t *testing.T) {
	e := IncomingEvent{
		Cluster:   "prod",
		Namespace: "default",
		Name:      "my-app-abc123-xyz",
		Reason:    "CrashLoopBackOff",
	}
	got := narrateEventFast(e, false, 0)
	assert.Contains(t, got, "crash-looping")
	assert.Contains(t, got, "default/my-app-abc123-xyz")
	assert.Contains(t, got, "prod")
}

func TestNarrateEventFast_CrashLoopRecurring(t *testing.T) {
	e := IncomingEvent{
		Cluster:   "prod",
		Namespace: "default",
		Name:      "my-app-abc123-xyz",
		Reason:    "CrashLoopBackOff",
	}
	got := narrateEventFast(e, true, 5)
	assert.Contains(t, got, "5 times")
}

func TestNarrateEventFast_OOMKilled(t *testing.T) {
	e := IncomingEvent{
		Cluster:   "staging",
		Namespace: "kube-system",
		Name:      "etcd-0",
		Reason:    "OOMKilled",
	}
	got := narrateEventFast(e, false, 0)
	assert.Contains(t, got, "out of memory")
	assert.Contains(t, got, "kube-system/etcd-0")
}

func TestNarrateEventFast_BackOff(t *testing.T) {
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "p1", Reason: "BackOff"}
	got := narrateEventFast(e, false, 0)
	assert.Contains(t, got, "back-off")
}

func TestNarrateEventFast_Evicted(t *testing.T) {
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "p1", Reason: "Evicted"}
	got := narrateEventFast(e, false, 0)
	assert.Contains(t, got, "evicted")
}

func TestNarrateEventFast_NodeNotReady(t *testing.T) {
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "node-1", Reason: "NodeNotReady"}
	got := narrateEventFast(e, false, 0)
	assert.Contains(t, got, "not ready")
}

func TestNarrateEventFast_FailedScheduling(t *testing.T) {
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "p1", Reason: "FailedScheduling"}
	got := narrateEventFast(e, false, 0)
	assert.Contains(t, got, "Cannot schedule")
}

func TestNarrateEventFast_FailedMount(t *testing.T) {
	e := IncomingEvent{Cluster: "c1", Namespace: "ns1", Name: "p1", Reason: "FailedMount"}
	got := narrateEventFast(e, false, 0)
	assert.Contains(t, got, "Volume mount failed")
}

func TestNarrateEventFast_DefaultReason(t *testing.T) {
	e := IncomingEvent{
		Cluster: "c1", Namespace: "ns1", Name: "p1",
		Reason: "SomethingElse", Message: "Something happened",
	}
	got := narrateEventFast(e, false, 0)
	assert.Contains(t, got, "SomethingElse")
	assert.Contains(t, got, "Something happened")
}

// ---------- deploymentNameFromPodName ----------

func TestDeploymentNameFromPodName(t *testing.T) {
	tests := []struct {
		name     string
		podName  string
		expected string
	}{
		{"standard pod name", "my-app-7f8b9c6d4-xz9k2", "my-app"},
		{"multi-hyphen deployment", "my-cool-app-7f8b9c6d4-xz9k2", "my-cool-app"},
		{"short pod name (no stripping)", "my-app", "my-app"},
		{"two-part name", "app-suffix", "app-suffix"},
		{"pod name without RS hash pattern", "app-ABC-xz9k2", "app-ABC-xz9k2"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := deploymentNameFromPodName(tt.podName)
			assert.Equal(t, tt.expected, got)
		})
	}
}

// ---------- looksLikeRSHash ----------

func TestLooksLikeRSHash(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"7f8b9c6d4", true},  // typical 9-char RS hash
		{"abcde", true},      // minimum 5 chars
		{"abcdefghij", true}, // maximum 10 chars
		{"abc", false},       // too short
		{"abcdefghijk", false}, // too long (11 chars)
		{"ABC123", false},      // uppercase not allowed
		{"abc-de", false},      // hyphens not allowed
		{"12345", true},        // all digits valid
		{"a1b2c", true},        // mix of lowercase and digits
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			assert.Equal(t, tt.expected, looksLikeRSHash(tt.input))
		})
	}
}

// ---------- deriveDiagnosisHeadline ----------

func TestDeriveDiagnosisHeadline(t *testing.T) {
	tests := []struct {
		name      string
		event     IncomingEvent
		severity  string
		recurring bool
		contains  string
	}{
		{"CrashLoopBackOff", IncomingEvent{Reason: "CrashLoopBackOff"}, "critical", false, "container exits immediately"},
		{"CrashLoopBackOff recurring", IncomingEvent{Reason: "CrashLoopBackOff"}, "critical", true, "recurring"},
		{"OOMKilling", IncomingEvent{Reason: "OOMKilling"}, "critical", false, "memory limit"},
		{"OOMKilled", IncomingEvent{Reason: "OOMKilled"}, "critical", false, "memory limit"},
		{"BackOff", IncomingEvent{Reason: "BackOff"}, "critical", false, "throttling restarts"},
		{"Evicted", IncomingEvent{Reason: "Evicted"}, "critical", false, "resource pressure"},
		{"NodeNotReady", IncomingEvent{Reason: "NodeNotReady"}, "critical", false, "node lost"},
		{"FailedScheduling", IncomingEvent{Reason: "FailedScheduling"}, "critical", false, "scheduler"},
		{"FailedMount", IncomingEvent{Reason: "FailedMount"}, "critical", false, "volume mount"},
		{"unknown critical", IncomingEvent{Reason: "SomeReason"}, "critical", false, "looks actionable"},
		{"unknown non-critical", IncomingEvent{Reason: "SomeReason"}, "warning", false, "noted for context"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := deriveDiagnosisHeadline(tt.event, tt.severity, tt.recurring)
			assert.Contains(t, got, tt.contains)
		})
	}
}

// ---------- recommendedTypeOrEmpty ----------

func TestRecommendedTypeOrEmpty_Nil(t *testing.T) {
	assert.Equal(t, "", recommendedTypeOrEmpty(nil))
}

func TestRecommendedTypeOrEmpty_NonNil(t *testing.T) {
	rec := &stellar.RecommendedAction{Type: "RestartDeployment"}
	assert.Equal(t, "RestartDeployment", recommendedTypeOrEmpty(rec))
}

func TestRecommendedTypeOrEmpty_EmptyType(t *testing.T) {
	rec := &stellar.RecommendedAction{Type: ""}
	assert.Equal(t, "", recommendedTypeOrEmpty(rec))
}
