package watcher

import (
	"strings"
	"testing"
	"time"
)

func assertSeverity(t *testing.T, reason, eventType, want string) {
	t.Helper()

	if got := InferSeverity(reason, eventType); got != want {
		t.Fatalf("InferSeverity(%q, %q) = %q, want %q", reason, eventType, got, want)
	}
}

func TestInferSeverity(t *testing.T) {
	tests := []struct {
		name      string
		reason    string
		eventType string
		want      string
	}{
		{name: "critical oom killing", reason: "OOMKilling", eventType: "Warning", want: "critical"},
		{name: "critical evicted", reason: "Evicted", eventType: "Warning", want: "critical"},
		{name: "critical node not ready", reason: "NodeNotReady", eventType: "Warning", want: "critical"},
		{name: "critical failed sandbox", reason: "FailedCreatePodSandBox", eventType: "Warning", want: "critical"},
		{name: "critical network not ready", reason: "NetworkNotReady", eventType: "Warning", want: "critical"},
		{name: "critical backoff", reason: "BackOff", eventType: "Warning", want: "critical"},
		{name: "critical crash loop", reason: "CrashLoopBackOff", eventType: "Warning", want: "critical"},
		{name: "warning failed mount", reason: "FailedMount", eventType: "Warning", want: "warning"},
		{name: "warning failed attach volume", reason: "FailedAttachVolume", eventType: "Warning", want: "warning"},
		{name: "warning failed scheduling", reason: "FailedScheduling", eventType: "Warning", want: "warning"},
		{name: "warning image pull backoff", reason: "ImagePullBackOff", eventType: "Warning", want: "warning"},
		{name: "warning err image pull", reason: "ErrImagePull", eventType: "Warning", want: "warning"},
		{name: "warning unhealthy", reason: "Unhealthy", eventType: "Warning", want: "warning"},
		{name: "warning dns config forming", reason: "DNSConfigForming", eventType: "Warning", want: "warning"},
		{name: "warning preempting", reason: "Preempting", eventType: "Warning", want: "warning"},
		{name: "warning unknown reason", reason: "SomeUnknownReason", eventType: "Warning", want: "warning"},
		{name: "info for non-warning event", reason: "OOMKilling", eventType: "Normal", want: "info"},
		{name: "info for empty event type", reason: "BackOff", eventType: "", want: "info"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertSeverity(t, tt.reason, tt.eventType, tt.want)
		})
	}
}

func assertNarration(t *testing.T, cluster, namespace, resource, reason, message string, count int, age time.Duration, want string) {
	t.Helper()

	if got := NarrateEvent(cluster, namespace, resource, reason, message, count, age); got != want {
		t.Fatalf("NarrateEvent(...) = %q, want %q", got, want)
	}
}

func TestNarrateEvent(t *testing.T) {
	truncatedMessage := strings.Repeat("x", 120) + "..."

	tests := []struct {
		name      string
		cluster   string
		namespace string
		resource  string
		reason    string
		message   string
		count     int
		age       time.Duration
		want      string
	}{
		{
			name:      "happy path uses all fields",
			cluster:   "prod-cluster",
			namespace: "default",
			resource:  "my-pod",
			reason:    "BackOff",
			message:   "container kept crashing",
			count:     1,
			age:       5 * time.Minute,
			want:      "I noticed BackOff on default/my-pod in cluster prod-cluster. Reason: container kept crashing. Occurred 1 time(s), last 5m0s ago.",
		},
		{
			name:      "long message is truncated and rounded",
			cluster:   "c",
			namespace: "ns",
			resource:  "res",
			reason:    "Reason",
			message:   strings.Repeat("x", 200),
			count:     2,
			age:       90 * time.Second,
			want:      "I noticed Reason on ns/res in cluster c. Reason: " + truncatedMessage + ". Occurred 2 time(s), last 2m0s ago.",
		},
		{
			name:      "zero values are rendered",
			cluster:   "",
			namespace: "",
			resource:  "",
			reason:    "",
			message:   "",
			count:     0,
			age:       0,
			want:      "I noticed  on / in cluster . Reason: . Occurred 0 time(s), last 0s ago.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertNarration(t, tt.cluster, tt.namespace, tt.resource, tt.reason, tt.message, tt.count, tt.age, tt.want)
		})
	}
}
