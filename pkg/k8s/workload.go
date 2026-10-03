package k8s

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	apimeta "k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/safego"
)

// GVRs for workload resources
var (
	gvrDeployments = schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "deployments",
	}
	gvrStatefulSets = schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "statefulsets",
	}
	gvrDaemonSets = schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "daemonsets",
	}
	gvrNodes = schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "nodes",
	}
)

// ListWorkloads lists all workloads across clusters
func (m *MultiClusterClient) ListWorkloads(ctx context.Context, cluster, namespace, workloadType string) (*v1alpha1.WorkloadList, error) {
	var clusterNames []string
	if cluster != "" {
		clusterNames = []string{cluster}
	} else {
		// Use DeduplicatedClusters to discover all unique clusters from kubeconfig
		dedupClusters, err := m.DeduplicatedClusters(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to list clusters: %w", err)
		}
		for _, c := range dedupClusters {
			clusterNames = append(clusterNames, c.Name)
		}
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	workloads := make([]v1alpha1.Workload, 0)
	// Per-cluster error accumulator — real failures (auth/network/RBAC)
	// MUST be surfaced so the UI can render partial failures rather than
	// silently hiding entire clusters (#6659). Mirrors the MCS/Argo pattern.
	clusterErrors := make([]v1alpha1.WorkloadClusterError, 0)

	slog.Info("[ListWorkloads] listing workloads", "clusterCount", len(clusterNames), "clusters", clusterNames)
	for _, clusterName := range clusterNames {
		cluster := clusterName
		wg.Add(1)
		safego.GoWith("workload-scan/"+cluster, func() {
			defer wg.Done()

			clusterWorkloads, err := m.ListWorkloadsForCluster(ctx, cluster, namespace, workloadType)
			if err != nil {
				slog.Error("[ListWorkloads] error listing workloads for cluster", "cluster", cluster, "error", err)
				errType := classifyError(err.Error())
				mu.Lock()
				clusterErrors = append(clusterErrors, v1alpha1.WorkloadClusterError{
					Cluster:   cluster,
					ErrorType: errType,
					Message:   redactedMessage(errType),
				})
				mu.Unlock()
				return
			}
			slog.Info("[ListWorkloads] found workloads in cluster", "count", len(clusterWorkloads), "cluster", cluster)

			mu.Lock()
			workloads = append(workloads, clusterWorkloads...)
			mu.Unlock()
		})
	}

	wg.Wait()

	return &v1alpha1.WorkloadList{
		Items:         workloads,
		TotalCount:    len(workloads),
		ClusterErrors: clusterErrors,
	}, nil
}

// ListWorkloadsForCluster lists workloads in a specific cluster.
//
// Real listing errors (auth, network, RBAC) are propagated to the caller so
// that the aggregate ListWorkloads response can surface partial failures
// instead of silently dropping the whole cluster (#6659). NotFound/NoMatch
// errors (type simply not registered on the cluster) are treated as empty
// lists for that kind, matching the Argo/MCS "CRD not installed" pattern.
func (m *MultiClusterClient) ListWorkloadsForCluster(ctx context.Context, contextName, namespace, workloadType string) ([]v1alpha1.Workload, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, fmt.Errorf("GetDynamicClient(%s): %w", contextName, err)
	}

	workloads := make([]v1alpha1.Workload, 0)

	// isKindNotRegistered reports whether an error means "this kind simply
	// isn't registered on this cluster" (benign skip), as opposed to a real
	// failure that must be surfaced.
	isKindNotRegistered := func(err error) bool {
		if err == nil {
			return false
		}
		if apierrors.IsNotFound(err) {
			return true
		}
		msg := err.Error()
		return strings.Contains(msg, "no matches for") ||
			strings.Contains(msg, "the server could not find the requested resource")
	}

	// List Deployments
	if workloadType == "" || workloadType == "Deployment" {
		var deployments interface{}
		var listErr error
		if namespace == "" {
			deployments, listErr = dynamicClient.Resource(gvrDeployments).List(ctx, metav1.ListOptions{})
		} else {
			deployments, listErr = dynamicClient.Resource(gvrDeployments).Namespace(namespace).List(ctx, metav1.ListOptions{})
		}
		if listErr != nil {
			if !isKindNotRegistered(listErr) {
				return nil, fmt.Errorf("list deployments on %s: %w", contextName, listErr)
			}
		} else {
			parsed := m.parseDeploymentsAsWorkloads(deployments, contextName)
			workloads = append(workloads, parsed...)
		}
	}

	// List StatefulSets
	if workloadType == "" || workloadType == "StatefulSet" {
		var statefulsets interface{}
		var listErr error
		if namespace == "" {
			statefulsets, listErr = dynamicClient.Resource(gvrStatefulSets).List(ctx, metav1.ListOptions{})
		} else {
			statefulsets, listErr = dynamicClient.Resource(gvrStatefulSets).Namespace(namespace).List(ctx, metav1.ListOptions{})
		}
		if listErr != nil {
			if !isKindNotRegistered(listErr) {
				return nil, fmt.Errorf("list statefulsets on %s: %w", contextName, listErr)
			}
		} else {
			parsed := m.parseStatefulSetsAsWorkloads(statefulsets, contextName)
			workloads = append(workloads, parsed...)
		}
	}

	// List DaemonSets
	if workloadType == "" || workloadType == "DaemonSet" {
		var daemonsets interface{}
		var listErr error
		if namespace == "" {
			daemonsets, listErr = dynamicClient.Resource(gvrDaemonSets).List(ctx, metav1.ListOptions{})
		} else {
			daemonsets, listErr = dynamicClient.Resource(gvrDaemonSets).Namespace(namespace).List(ctx, metav1.ListOptions{})
		}
		if listErr != nil {
			if !isKindNotRegistered(listErr) {
				return nil, fmt.Errorf("list daemonsets on %s: %w", contextName, listErr)
			}
		} else {
			parsed := m.parseDaemonSetsAsWorkloads(daemonsets, contextName)
			workloads = append(workloads, parsed...)
		}
	}

	return workloads, nil
}

// GetWorkload gets a specific workload by namespaced name.
//
// Previously this made a full ListWorkloadsForCluster call (listing ALL
// Deployments/StatefulSets/DaemonSets cluster-wide) then linear-searched
// the result for one name — O(N) in cluster size just to look up a single
// resource. Now it issues targeted Get calls for each workload kind and
// returns on the first hit (#6509). The linear-search path is preserved as
// a fallback in case a Get returns an unexpected non-NotFound error so
// callers never regress on correctness.
func (m *MultiClusterClient) GetWorkload(ctx context.Context, cluster, namespace, name string) (*v1alpha1.Workload, error) {
	if namespace == "" {
		// Namespaced Get requires a namespace. Fall back to the list path,
		// which can scan across all namespaces.
		return m.getWorkloadByList(ctx, cluster, namespace, name)
	}

	dynamicClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return nil, err
	}

	// Try each known workload kind in order. The parse* helpers operate on
	// lists, so we wrap each single-object result in a one-item list.
	kinds := []struct {
		gvr    schema.GroupVersionResource
		parser func(interface{}, string) []v1alpha1.Workload
	}{
		{gvrDeployments, m.parseDeploymentsAsWorkloads},
		{gvrStatefulSets, m.parseStatefulSetsAsWorkloads},
		{gvrDaemonSets, m.parseDaemonSetsAsWorkloads},
	}

	for _, k := range kinds {
		obj, getErr := dynamicClient.Resource(k.gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			if apierrors.IsNotFound(getErr) {
				// Expected — this kind doesn't have an object with that name. Try next.
				continue
			}
			if apimeta.IsNoMatchError(getErr) {
				// The cluster doesn't know about this GVR (older k8s, CRD missing,
				// or discovery cache stale). Fall back to the legacy list-based
				// path which handles kind-availability gracefully. (#6547)
				return m.getWorkloadByList(ctx, cluster, namespace, name)
			}
			// Real error (auth, network, server). Do NOT silently fall through
			// to the list path — that path logs-and-swallows list errors and
			// would turn an auth failure into a false "not found". Return it
			// so callers can surface the underlying problem. (#6547)
			return nil, fmt.Errorf("get %s/%s in %s: %w", k.gvr.Resource, name, namespace, getErr)
		}
		list := &unstructured.UnstructuredList{Items: []unstructured.Unstructured{*obj}}
		parsed := k.parser(list, cluster)
		if len(parsed) == 0 {
			continue
		}
		w := parsed[0]
		return &w, nil
	}

	// None of the typed Gets found the object.
	return nil, nil
}

// getWorkloadByList is the legacy O(N) path preserved as a fallback for
// GetWorkload when the direct-Get optimization cannot proceed (#6509).
func (m *MultiClusterClient) getWorkloadByList(ctx context.Context, cluster, namespace, name string) (*v1alpha1.Workload, error) {
	workloads, err := m.ListWorkloadsForCluster(ctx, cluster, namespace, "")
	if err != nil {
		return nil, err
	}

	for _, w := range workloads {
		if w.Name == name {
			return &w, nil
		}
	}

	return nil, nil
}
