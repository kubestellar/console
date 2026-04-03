package k8s

import (
	"context"
	"fmt"
	"log/slog"
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
	time.RFC3339,               // 2006-01-02T15:04:05Z07:00
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
				slog.Error(fmt.Sprintf("[argocd] Error listing applications on cluster %s: %v", cluster, err))
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
		slog.Error(fmt.Sprintf("[argocd] Error listing applications on cluster %s: %v", contextName, err))
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

// ListArgoApplicationSets lists all ArgoCD ApplicationSet resources across all clusters.
// If ArgoCD CRDs are not installed on a cluster, that cluster is silently skipped.
func (m *MultiClusterClient) ListArgoApplicationSets(ctx context.Context) (*v1alpha1.ArgoApplicationSetList, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	for name := range m.clients {
		clusters = append(clusters, name)
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	var mu sync.Mutex
	appSets := make([]v1alpha1.ArgoApplicationSet, 0)

	for _, clusterName := range clusters {
		wg.Add(1)
		go func(cluster string) {
			defer wg.Done()

			clusterAppSets, err := m.ListArgoApplicationSetsForCluster(ctx, cluster)
			if err != nil {
				slog.Info(fmt.Sprintf("[ArgoCD] Skipping cluster %s for ApplicationSets: %v", cluster, err))
				return // CRD not installed or cluster unreachable — skip silently
			}

			mu.Lock()
			appSets = append(appSets, clusterAppSets...)
			mu.Unlock()
		}(clusterName)
	}

	wg.Wait()

	return &v1alpha1.ArgoApplicationSetList{
		Items:      appSets,
		TotalCount: len(appSets),
	}, nil
}

// ListArgoApplicationSetsForCluster lists ArgoCD ApplicationSet resources in a specific cluster.
// Returns an empty list (not an error) if ArgoCD CRDs are not installed.
func (m *MultiClusterClient) ListArgoApplicationSetsForCluster(ctx context.Context, contextName string) ([]v1alpha1.ArgoApplicationSet, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	list, err := dynamicClient.Resource(v1alpha1.ArgoApplicationSetGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) || isNoMatchError(err) {
			// ArgoCD CRDs not installed — return empty list silently
			return []v1alpha1.ArgoApplicationSet{}, nil
		}
		// Real error (auth, network, RBAC) — log and propagate
		return nil, fmt.Errorf("failed to list ApplicationSets on cluster %s: %w", contextName, err)
	}

	return m.parseArgoApplicationSetsFromList(list, contextName), nil
}

// parseArgoApplicationSetsFromList parses ArgoCD ApplicationSets from an unstructured list
func (m *MultiClusterClient) parseArgoApplicationSetsFromList(list interface{}, contextName string) []v1alpha1.ArgoApplicationSet {
	appSets := make([]v1alpha1.ArgoApplicationSet, 0)

	uList, ok := list.(*unstructured.UnstructuredList)
	if !ok {
		return appSets
	}

	for i := range uList.Items {
		item := &uList.Items[i]
		content := item.UnstructuredContent()

		appSet := v1alpha1.ArgoApplicationSet{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			Cluster:   contextName,
			Status:    "Unknown",
		}

		// Parse spec.generators — extract generator type names
		if spec, found, _ := unstructuredNestedMap(content, "spec"); found {
			if generators, ok := spec["generators"].([]interface{}); ok {
				appSet.Generators = parseGeneratorTypes(generators)
			}

			// Parse spec.template.metadata.name for the template app name
			if tmpl, tmplFound, _ := unstructuredNestedMap(spec, "template"); tmplFound {
				if meta, metaFound, _ := unstructuredNestedMap(tmpl, "metadata"); metaFound {
					if name, ok := meta["name"].(string); ok {
						appSet.Template = name
					}
				}
			}

			// Parse spec.syncPolicy logic correctly
			appSet.SyncPolicy = "Manual"
			if tmpl, tmplFound, _ := unstructuredNestedMap(spec, "template"); tmplFound {
				if tmplSpec, tsFound, _ := unstructuredNestedMap(tmpl, "spec"); tsFound {
					if sp, spFound, _ := unstructuredNestedMap(tmplSpec, "syncPolicy"); spFound {
						if _, hasAuto := sp["automated"]; hasAuto {
							appSet.SyncPolicy = "Automated"
						}
					}
				}
			}
		}

		// Parse status.conditions for overall status
		if status, found, _ := unstructuredNestedMap(content, "status"); found {
			if conditions, ok := status["conditions"].([]interface{}); ok {
				appSet.Status = parseAppSetConditionStatus(conditions)
			}
			// Parse status.applicationStatus for app count
			if appStatuses, ok := status["applicationStatus"].([]interface{}); ok {
				appSet.AppCount = len(appStatuses)
			}
		}

		appSets = append(appSets, appSet)
	}

	return appSets
}

// parseGeneratorTypes extracts generator type names from the generators array
func parseGeneratorTypes(generators []interface{}) []string {
	types := make([]string, 0, len(generators))
	knownTypes := []string{"list", "clusters", "cluster", "git", "matrix", "merge", "scmProvider", "pullRequest", "clusterDecisionResource"}

	for _, gen := range generators {
		genMap, ok := gen.(map[string]interface{})
		if !ok {
			continue
		}
		for _, t := range knownTypes {
			if _, exists := genMap[t]; exists {
				types = append(types, t)
				break
			}
		}
	}

	if len(types) == 0 {
		types = append(types, "unknown")
	}
	return types
}

// parseAppSetConditionStatus returns a human-readable status from ApplicationSet conditions
func parseAppSetConditionStatus(conditions []interface{}) string {
	for _, cond := range conditions {
		condMap, ok := cond.(map[string]interface{})
		if !ok {
			continue
		}
		condType, _ := condMap["type"].(string)
		condStatus, _ := condMap["status"].(string)

		if condType == "ErrorOccurred" && condStatus == "True" {
			return "Error"
		}
		if condType == "ResourcesUpToDate" && condStatus == "True" {
			return "Healthy"
		}
	}
	return "Progressing"
}
