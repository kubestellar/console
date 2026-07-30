package watcher

import (
	"fmt"
	"time"
)

func InferSeverity(reason, eventType string) string {
	if eventType != "Warning" {
		return "info"
	}
	criticalReasons := map[string]bool{
		"OOMKilling": true, "Evicted": true, "NodeNotReady": true,
		"FailedCreatePodSandBox": true, "NetworkNotReady": true,
		"BackOff": true, "CrashLoopBackOff": true,
	}
	warningReasons := map[string]bool{
		"FailedMount": true, "FailedAttachVolume": true, "FailedScheduling": true,
		"ImagePullBackOff": true, "ErrImagePull": true, "Unhealthy": true,
		"DNSConfigForming": true, "Preempting": true,
	}
	if criticalReasons[reason] {
		return "critical"
	}
	if warningReasons[reason] {
		return "warning"
	}
	return "warning"
}

func NarrateEvent(cluster, namespace, resource, reason, message string, count int, age time.Duration) string {
	return fmt.Sprintf(
		"I noticed %s on %s/%s in cluster %s. Reason: %s. Occurred %d time(s), last %s ago.",
		reason, namespace, resource, cluster, truncate(message, 120), count, age.Round(time.Minute),
	)
}
