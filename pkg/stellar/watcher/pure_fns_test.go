package watcher

import (
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// DedupKey* — pure key-generation functions
// ---------------------------------------------------------------------------

func TestDedupKeyEvent(t *testing.T) {
	got := DedupKeyEvent("prod", "default", "nginx", "BackOff")
	want := "ev:prod:default:nginx:BackOff"
	if got != want {
		t.Errorf("DedupKeyEvent = %q, want %q", got, want)
	}
}

func TestDedupKeyEvent_EmptyFields(t *testing.T) {
	got := DedupKeyEvent("", "", "", "")
	want := "ev::::"
	if got != want {
		t.Errorf("DedupKeyEvent empty = %q, want %q", got, want)
	}
}

func TestDedupKeyCrash(t *testing.T) {
	got := DedupKeyCrash("us-east", "kube-system", "coredns-abc", "coredns")
	want := "crash:us-east:kube-system:coredns-abc:coredns"
	if got != want {
		t.Errorf("DedupKeyCrash = %q, want %q", got, want)
	}
}

func TestDedupKeyNodeNotReady(t *testing.T) {
	got := DedupKeyNodeNotReady("cluster1", "node-42")
	want := "node-notready:cluster1:node-42"
	if got != want {
		t.Errorf("DedupKeyNodeNotReady = %q, want %q", got, want)
	}
}

func TestDedupKeys_Uniqueness(t *testing.T) {
	// Keys from different fn families must never collide.
	a := DedupKeyEvent("c", "ns", "r", "Reason")
	b := DedupKeyCrash("c", "ns", "r", "Reason")
	c := DedupKeyNodeNotReady("c", "ns")
	keys := []string{a, b, c}
	seen := map[string]bool{}
	for _, k := range keys {
		if seen[k] {
			t.Errorf("key collision: %q appeared twice", k)
		}
		seen[k] = true
	}
}

// ---------------------------------------------------------------------------
// InferSeverity
// ---------------------------------------------------------------------------

func TestInferSeverity_NonWarning(t *testing.T) {
	got := InferSeverity("OOMKilling", "Normal")
	if got != "info" {
		t.Errorf("non-Warning event should be info, got %q", got)
	}
}

func TestInferSeverity_CriticalReasons(t *testing.T) {
	criticals := []string{
		"OOMKilling", "Evicted", "NodeNotReady",
		"FailedCreatePodSandBox", "NetworkNotReady",
		"BackOff", "CrashLoopBackOff",
	}
	for _, reason := range criticals {
		got := InferSeverity(reason, "Warning")
		if got != "critical" {
			t.Errorf("InferSeverity(%q, Warning) = %q, want critical", reason, got)
		}
	}
}

func TestInferSeverity_WarningReasons(t *testing.T) {
	warnings := []string{
		"FailedMount", "FailedAttachVolume", "FailedScheduling",
		"ImagePullBackOff", "ErrImagePull", "Unhealthy",
		"DNSConfigForming", "Preempting",
	}
	for _, reason := range warnings {
		got := InferSeverity(reason, "Warning")
		if got != "warning" {
			t.Errorf("InferSeverity(%q, Warning) = %q, want warning", reason, got)
		}
	}
}

func TestInferSeverity_UnknownWarningReason(t *testing.T) {
	got := InferSeverity("SomeUnknownReason", "Warning")
	if got != "warning" {
		t.Errorf("unknown Warning reason should default to warning, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// NarrateEvent
// ---------------------------------------------------------------------------

func TestNarrateEvent_ContainsFields(t *testing.T) {
	age := 5 * time.Minute
	msg := NarrateEvent("prod-cluster", "default", "my-pod", "BackOff", "container kept crashing", 3, age)

	for _, want := range []string{"prod-cluster", "default", "my-pod", "BackOff", "3"} {
		if !strings.Contains(msg, want) {
			t.Errorf("NarrateEvent output missing %q: %q", want, msg)
		}
	}
}

func TestNarrateEvent_TruncatesLongMessage(t *testing.T) {
	longMsg := strings.Repeat("x", 200)
	age := 1 * time.Minute
	msg := NarrateEvent("c", "ns", "res", "Reason", longMsg, 1, age)
	// truncate max is 120 chars; the narrative should not contain the full 200-char message
	if strings.Contains(msg, longMsg) {
		t.Error("NarrateEvent should truncate message > 120 chars")
	}
}

func TestNarrateEvent_ZeroCount(t *testing.T) {
	msg := NarrateEvent("c", "ns", "r", "Reason", "msg", 0, 0)
	if !strings.Contains(msg, "0 time(s)") {
		t.Errorf("expected zero count in narrative, got: %q", msg)
	}
}
