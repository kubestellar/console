package watcher

import "testing"

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
