package k8s

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

// isNoMatchError returns true when the error indicates that a CRD/resource type
// is not registered on the cluster (e.g., "no matches for kind X in version Y").
// This happens when ArgoCD CRDs are not installed.
func isNoMatchError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "no matches for") || strings.Contains(msg, "the server could not find the requested resource")
}

// ISO 8601 layouts used by ArgoCD for timestamp fields
var argoTimestampLayouts = []string{
	time.RFC3339,                // 2006-01-02T15:04:05Z07:00
	"2006-01-02T15:04:05Z",     // UTC explicit
	"2006-01-02T15:04:05.000Z", // millisecond precision
}

// ListArgoApplications lists all ArgoCD Application resources across all clusters.
// If ArgoCD CRDs are not installed on a cluster, that cluster is silently skipped.
func (m *MultiClusterClient) ListArgoApplications(ctx context.Context) (*v1alpha1.ArgoApplicationList, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	for name := range m.clients {
		clusters = append(clusters, name)
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	var mu sync.Mutex
	apps := make([]v1alpha1.ArgoApplication, 0)

	for _, clusterName := range clusters {
		wg.Add(1)
		go func(cluster string) {
			defer wg.Done()

			clusterApps, err := m.ListArgoApplicationsForCluster(ctx, cluster, "")
			if err != nil {
				log.Printf("[argocd] Error listing applications on cluster %s: %v", cluster, err)
				return
			}

			mu.Lock()
			apps = append(apps, clusterApps...)
			mu.Unlock()
		}(clusterName)
	}

	wg.Wait()

	return &v1alpha1.ArgoApplicationList{
		Items:      apps,
		TotalCount: len(apps),
	}, nil
}

// ListArgoApplicationsForCluster lists ArgoCD Application resources in a specific cluster.
// Returns an empty list (not an error) if ArgoCD CRDs are not installed.
func (m *MultiClusterClient) ListArgoApplicationsForCluster(ctx context.Context, contextName, namespace string) ([]v1alpha1.ArgoApplication, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	var list interface{}
	if namespace == "" {
		list, err = dynamicClient.Resource(v1alpha1.ArgoApplicationGVR).List(ctx, metav1.ListOptions{})
	} else {
		list, err = dynamicClient.Resource(v1alpha1.ArgoApplicationGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	}

	if err != nil {
		if apierrors.IsNotFound(err) || isNoMatchError(err) {
			// ArgoCD CRDs not installed — return empty list silently
			return []v1alpha1.ArgoApplication{}, nil
		}
		// Real error (auth, network, RBAC) — log and propagate
		log.Printf("[argocd] Error listing applications on cluster %s: %v", contextName, err)
		return nil, err
	}

	return m.parseArgoApplicationsFromList(list, contextName)
}

// parseArgoApplicationsFromList parses ArgoCD Applications from an unstructured list
func (m *MultiClusterClient) parseArgoApplicationsFromList(list interface{}, contextName string) ([]v1alpha1.ArgoApplication, error) {
	apps := make([]v1alpha1.ArgoApplication, 0)

	uList, ok := list.(*unstructured.UnstructuredList)
	if !ok {
		return apps, nil
	}

	for i := range uList.Items {
		item := &uList.Items[i]
		content := item.UnstructuredContent()

		app := v1alpha1.ArgoApplication{
			Name:         item.GetName(),
			Namespace:    item.GetNamespace(),
			Cluster:      contextName,
			SyncStatus:   "Unknown",
			HealthStatus: "Unknown",
		}

		// Parse spec.source
		if spec, found, _ := unstructuredNestedMap(content, "spec"); found {
			if source, sourceFound, _ := unstructuredNestedMap(spec, "source"); sourceFound {
				if repoURL, ok := source["repoURL"].(string); ok {
					app.Source.RepoURL = repoURL
				}
				if path, ok := source["path"].(string); ok {
					app.Source.Path = path
				}
				if targetRevision, ok := source["targetRevision"].(string); ok {
					app.Source.TargetRevision = targetRevision
				}
			}
		}

		// Parse status.sync.status and status.health.status
		if status, found, _ := unstructuredNestedMap(content, "status"); found {
			if syncMap, syncFound, _ := unstructuredNestedMap(status, "sync"); syncFound {
				if syncStatus, ok := syncMap["status"].(string); ok {
					app.SyncStatus = syncStatus
				}
			}

			if healthMap, healthFound, _ := unstructuredNestedMap(status, "health"); healthFound {
				if healthStatus, ok := healthMap["status"].(string); ok {
					app.HealthStatus = healthStatus
				}
			}

			// Parse status.operationState.finishedAt for lastSynced
			if opState, opFound, _ := unstructuredNestedMap(status, "operationState"); opFound {
				if finishedAt, ok := opState["finishedAt"].(string); ok {
					app.LastSynced = parseArgoTimeAgo(finishedAt)
				}
			}

			// Fallback: use reconciledAt
			if app.LastSynced == "" {
				if reconciledAt, ok := status["reconciledAt"].(string); ok {
					app.LastSynced = parseArgoTimeAgo(reconciledAt)
				}
			}
		}

		apps = append(apps, app)
	}

	return apps, nil
}

// parseArgoTimeAgo converts an ISO 8601 timestamp string to a human-readable "X ago" format
func parseArgoTimeAgo(timeStr string) string {
	if timeStr == "" {
		return ""
	}

	for _, layout := range argoTimestampLayouts {
		if parsedTime, err := time.Parse(layout, timeStr); err == nil {
			return v1alpha1.TimeSinceArgo(parsedTime)
		}
	}

	// If we can't parse the timestamp, return the raw string
	return timeStr
}
