package watcher

import "fmt"

func DedupKeyEvent(cluster, namespace, resourceName, reason string) string {
	return fmt.Sprintf("ev:%s:%s:%s:%s", cluster, namespace, resourceName, reason)
}

func DedupKeyCrash(cluster, namespace, pod, container string) string {
	return fmt.Sprintf("crash:%s:%s:%s:%s", cluster, namespace, pod, container)
}

func DedupKeyNodeNotReady(cluster, nodeName string) string {
	return fmt.Sprintf("node-notready:%s:%s", cluster, nodeName)
}
