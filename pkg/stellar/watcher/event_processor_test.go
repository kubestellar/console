package watcher

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestEventProcessorInferSeverity_TableDriven(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		reason    string
		eventType string
		want      string
	}{
		{name: "non warning events stay info", reason: "CrashLoopBackOff", eventType: "Normal", want: "info"},
		{name: "critical warning reason", reason: "CrashLoopBackOff", eventType: "Warning", want: "critical"},
		{name: "warning warning reason", reason: "FailedMount", eventType: "Warning", want: "warning"},
		{name: "unknown warning defaults warning", reason: "SomethingElse", eventType: "Warning", want: "warning"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.want, InferSeverity(tt.reason, tt.eventType))
		})
	}
}

func TestEventProcessorNarrateEvent_FormatsAndTruncates(t *testing.T) {
	t.Parallel()

	longMessage := strings.Repeat("x", 130)
	got := NarrateEvent("cluster-a", "tenant-a", "pod/demo", "BackOff", longMessage, 7, 90*time.Second)

	assert.Contains(t, got, "cluster-a")
	assert.Contains(t, got, "tenant-a/pod/demo")
	assert.Contains(t, got, "I noticed BackOff")
	assert.Contains(t, got, "Occurred 7 time(s)")
	assert.Contains(t, got, "last 2m0s ago")
	assert.NotContains(t, got, longMessage)
	assert.Contains(t, got, strings.Repeat("x", 120)+"...")
}

func TestEventProcessorNarrateEvent_PreservesShortMessage(t *testing.T) {
	t.Parallel()

	got := NarrateEvent("cluster-b", "default", "deployment/api", "FailedMount", "volume unavailable", 1, 31*time.Second)

	assert.Contains(t, got, "Reason: volume unavailable")
	assert.Contains(t, got, "last 1m0s ago")
}
