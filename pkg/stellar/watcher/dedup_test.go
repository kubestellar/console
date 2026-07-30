package watcher

import "testing"

func TestDedupKeyEvent_TableDriven(t *testing.T) {
	tests := []struct {
		cluster, namespace, resource, reason string
		want                                 string
	}{
		{"prod", "default", "my-pod", "CrashLoopBackOff", "ev:prod:default:my-pod:CrashLoopBackOff"},
		{"", "", "", "", "ev::::"},
		{"c1", "ns", "deploy-abc", "FailedScheduling", "ev:c1:ns:deploy-abc:FailedScheduling"},
	}
	for _, tt := range tests {
		got := DedupKeyEvent(tt.cluster, tt.namespace, tt.resource, tt.reason)
		if got != tt.want {
			t.Errorf("DedupKeyEvent(%q,%q,%q,%q) = %q, want %q",
				tt.cluster, tt.namespace, tt.resource, tt.reason, got, tt.want)
		}
	}
}

func TestDedupKeyCrash_TableDriven(t *testing.T) {
	tests := []struct {
		cluster, namespace, pod, container string
		want                              string
	}{
		{"prod", "default", "my-pod-abc", "main", "crash:prod:default:my-pod-abc:main"},
		{"", "", "", "", "crash::::"},
	}
	for _, tt := range tests {
		got := DedupKeyCrash(tt.cluster, tt.namespace, tt.pod, tt.container)
		if got != tt.want {
			t.Errorf("DedupKeyCrash(%q,%q,%q,%q) = %q, want %q",
				tt.cluster, tt.namespace, tt.pod, tt.container, got, tt.want)
		}
	}
}

func TestDedupKeyNodeNotReady_TableDriven(t *testing.T) {
	tests := []struct {
		cluster, nodeName string
		want              string
	}{
		{"prod", "node-1", "node-notready:prod:node-1"},
		{"", "", "node-notready::"},
	}
	for _, tt := range tests {
		got := DedupKeyNodeNotReady(tt.cluster, tt.nodeName)
		if got != tt.want {
			t.Errorf("DedupKeyNodeNotReady(%q,%q) = %q, want %q",
				tt.cluster, tt.nodeName, got, tt.want)
		}
	}
}
