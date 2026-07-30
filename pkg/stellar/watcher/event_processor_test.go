package watcher

import (
	"strings"
	"testing"
	"time"
)

const (
	narrateMessageLimit = 120
	longMessageLength   = 150
)

func assertSeverity(t *testing.T, reason, eventType, want string) {
	t.Helper()

	if got := InferSeverity(reason, eventType); got != want {
		t.Fatalf("InferSeverity(%q, %q) = %q, want %q", reason, eventType, got, want)
	}
}

func assertContainsAll(t *testing.T, got string, fields ...string) {
	t.Helper()

	for _, field := range fields {
		if !strings.Contains(got, field) {
			t.Fatalf("expected %q to contain %q", got, field)
		}
	}
}

func TestInferSeverity_NonWarningEventTypeTable(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name      string
		reason    string
		eventType string
	}{
		{name: "normal oom killing", reason: "OOMKilling", eventType: "Normal"},
		{name: "normal crash loop", reason: "CrashLoopBackOff", eventType: "Normal"},
		{name: "normal failed mount", reason: "FailedMount", eventType: "Normal"},
		{name: "normal arbitrary reason", reason: "anything", eventType: "Normal"},
		{name: "info oom killing", reason: "OOMKilling", eventType: "Info"},
		{name: "info crash loop", reason: "CrashLoopBackOff", eventType: "Info"},
		{name: "info failed mount", reason: "FailedMount", eventType: "Info"},
		{name: "info arbitrary reason", reason: "anything", eventType: "Info"},
		{name: "empty type oom killing", reason: "OOMKilling", eventType: ""},
		{name: "empty type crash loop", reason: "CrashLoopBackOff", eventType: ""},
		{name: "empty type failed mount", reason: "FailedMount", eventType: ""},
		{name: "empty type arbitrary reason", reason: "anything", eventType: ""},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assertSeverity(t, tc.reason, tc.eventType, "info")
		})
	}
}

func TestInferSeverity_CriticalReasonsTable(t *testing.T) {
	t.Parallel()

	criticalReasons := []string{
		"OOMKilling",
		"Evicted",
		"NodeNotReady",
		"FailedCreatePodSandBox",
		"NetworkNotReady",
		"BackOff",
		"CrashLoopBackOff",
	}

	for _, reason := range criticalReasons {
		reason := reason
		t.Run(reason, func(t *testing.T) {
			t.Parallel()
			assertSeverity(t, reason, "Warning", "critical")
		})
	}
}

func TestInferSeverity_WarningReasonsTable(t *testing.T) {
	t.Parallel()

	warningReasons := []string{
		"FailedMount",
		"FailedAttachVolume",
		"FailedScheduling",
		"ImagePullBackOff",
		"ErrImagePull",
		"Unhealthy",
		"DNSConfigForming",
		"Preempting",
	}

	for _, reason := range warningReasons {
		reason := reason
		t.Run(reason, func(t *testing.T) {
			t.Parallel()
			assertSeverity(t, reason, "Warning", "warning")
		})
	}
}

func TestInferSeverity_UnknownReasonWarning(t *testing.T) {
	t.Parallel()
	assertSeverity(t, "SomeUnknownReason", "Warning", "warning")
}

func TestInferSeverity_EmptyReasonWarning(t *testing.T) {
	t.Parallel()
	assertSeverity(t, "", "Warning", "warning")
}

func TestNarrateEvent_ContainsKeyFields(t *testing.T) {
	t.Parallel()

	got := NarrateEvent("prod-cluster", "default", "nginx-pod", "BackOff", "container failing", 3, 5*time.Minute)
	assertContainsAll(t, got, "prod-cluster", "default", "nginx-pod", "BackOff", "container failing", "3 time(s)")
}

func TestNarrateEvent_MessageTruncatedAt120(t *testing.T) {
	t.Parallel()

	longMessage := strings.Repeat("x", longMessageLength)
	got := NarrateEvent("c", "ns", "res", "reason", longMessage, 1, time.Minute)
	if strings.Contains(got, longMessage) {
		t.Fatalf("expected message to be truncated, got %q", got)
	}
	assertContainsAll(t, got, strings.Repeat("x", narrateMessageLimit)+"...")
}

func TestNarrateEvent_ShortMessageNotTruncated(t *testing.T) {
	t.Parallel()

	message := "pod restarting"
	got := NarrateEvent("c", "ns", "res", "CrashLoopBackOff", message, 1, time.Minute)
	assertContainsAll(t, got, message)
	if strings.Contains(got, "...") {
		t.Fatalf("expected short message to be unmodified, got %q", got)
	}
}

func TestNarrateEvent_AgeRoundedToMinute(t *testing.T) {
	t.Parallel()

	got := NarrateEvent("c", "ns", "res", "r", "msg", 1, 90*time.Second)
	assertContainsAll(t, got, "2m")
}

func TestNarrateEvent_MessageExactly120Chars(t *testing.T) {
	t.Parallel()

	message := strings.Repeat("a", narrateMessageLimit)
	got := NarrateEvent("c", "ns", "res", "r", message, 1, time.Minute)
	assertContainsAll(t, got, message)
	if strings.Contains(got, "...") {
		t.Fatalf("expected %d-char message to avoid truncation, got %q", narrateMessageLimit, got)
	}
}
