package providers

import (
	"context"
	"fmt"
	"math"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func init() {
	federation.Register(&capiProvider{})
}

var (
	capiClusterGVR = schema.GroupVersionResource{
		Group:    "cluster.x-k8s.io",
		Version:  "v1beta1",
		Resource: "clusters",
	}
	capiMachineDeploymentGVR = schema.GroupVersionResource{
		Group:    "cluster.x-k8s.io",
		Version:  "v1beta1",
		Resource: "machinedeployments",
	}
	capiKubeadmControlPlaneGVR = schema.GroupVersionResource{
		Group:    "controlplane.cluster.x-k8s.io",
		Version:  "v1beta1",
		Resource: "kubeadmcontrolplanes",
	}
)

const (
	// capiPhaseProvisioning is the CAPI Cluster.status.phase when
	// infrastructure is being created.
	capiPhaseProvisioning = "Provisioning"
	// capiPhasePending is the initial phase before provisioning starts.
	capiPhasePending = "Pending"
	// capiPhaseProvisioned is set once the cluster is fully up.
	capiPhaseProvisioned = "Provisioned"
	// capiPhaseFailed is set when provisioning has permanently errored.
	capiPhaseFailed = "Failed"
	// capiPhaseDeleting is set when the cluster is being torn down.
	capiPhaseDeleting = "Deleting"

	// capiClusterNameLabel is used by MachineDeployments and
	// KubeadmControlPlanes to identify the owning CAPI Cluster.
	capiClusterNameLabel = "cluster.x-k8s.io/cluster-name"

	// capiInfraGroupPrefix is prepended to the infrastructure reference
	// kind to form the federation group name (e.g. "capi:aws").
	capiInfraGroupPrefix = "capi:"
)

type capiProvider struct{}

func (p *capiProvider) Name() federation.FederationProviderName {
	return federation.ProviderCAPI
}

func (p *capiProvider) Detect(ctx context.Context, cfg *rest.Config) (federation.DetectResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.DetectResult{}, err
	}
	_, err = dc.Resource(capiClusterGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return federation.DetectResult{Detected: false}, nil
		}
		return federation.DetectResult{}, err
	}
	return federation.DetectResult{Detected: true, Version: "v1beta1"}, nil
}

func (p *capiProvider) ReadClusters(ctx context.Context, cfg *rest.Config) ([]federation.FederatedCluster, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}

	clusterList, err := dc.Resource(capiClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	// Batch-fetch MachineDeployments for machine counts.
	mdByCluster := capiIndexMachineDeployments(ctx, dc)

	// Batch-fetch KubeadmControlPlanes for control-plane readiness.
	kcpByCluster := capiIndexKubeadmControlPlanes(ctx, dc)

	out := make([]federation.FederatedCluster, 0, len(clusterList.Items))
	for i := range clusterList.Items {
		fc := parseCAPICluster(&clusterList.Items[i], mdByCluster, kcpByCluster)
		out = append(out, fc)
	}
	return out, nil
}

func (p *capiProvider) ReadGroups(ctx context.Context, cfg *rest.Config) ([]federation.FederatedGroup, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}

	clusterList, err := dc.Resource(capiClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	// Group clusters by infrastructure reference kind.
	groupMembers := map[string][]string{}
	for i := range clusterList.Items {
		obj := &clusterList.Items[i]
		name := obj.GetName()
		infraKind := capiInfraRefKind(obj)
		if infraKind == "" {
			continue
		}
		groupName := capiInfraGroupPrefix + strings.ToLower(infraKind)
		groupMembers[groupName] = append(groupMembers[groupName], name)
	}

	out := make([]federation.FederatedGroup, 0, len(groupMembers))
	for gName, members := range groupMembers {
		out = append(out, federation.FederatedGroup{
			Provider: federation.ProviderCAPI,
			Name:     gName,
			Members:  members,
			Kind:     federation.FederatedGroupInfra,
		})
	}
	return out, nil
}

func (p *capiProvider) ReadPendingJoins(_ context.Context, _ *rest.Config) ([]federation.PendingJoin, error) {
	// CAPI clusters in provisioning state are already surfaced as clusters
	// with ClusterStateProvisioning — no separate pending-join concept.
	return nil, nil
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

func parseCAPICluster(
	obj *unstructured.Unstructured,
	mdByCluster map[string]capiMachineSummary,
	kcpByCluster map[string]bool,
) federation.FederatedCluster {
	name := obj.GetName()
	labels := obj.GetLabels()
	if labels == nil {
		labels = map[string]string{}
	}

	phase, _, _ := unstructured.NestedString(obj.Object, "status", "phase")
	state := capiPhaseToState(phase)

	controlPlaneReady := capiControlPlaneReady(obj, kcpByCluster)
	infraReady, _, _ := unstructured.NestedBool(obj.Object, "status", "infrastructureReady")

	md := mdByCluster[name]

	apiServerURL := capiAPIServerURL(obj)

	return federation.FederatedCluster{
		Provider:   federation.ProviderCAPI,
		Name:       name,
		State:      state,
		Available:  capiAvailableFromState(state),
		Labels:     labels,
		APIServerURL: apiServerURL,
		Lifecycle: &federation.Lifecycle{
			Phase:               phase,
			ControlPlaneReady:   controlPlaneReady,
			InfrastructureReady: infraReady,
			DesiredMachines:     md.desired,
			ReadyMachines:       md.ready,
		},
		Raw: obj.Object,
	}
}

func capiPhaseToState(phase string) federation.ClusterState {
	switch phase {
	case capiPhaseProvisioning, capiPhasePending:
		return federation.ClusterStateProvisioning
	case capiPhaseProvisioned:
		return federation.ClusterStateProvisioned
	case capiPhaseFailed:
		return federation.ClusterStateFailed
	case capiPhaseDeleting:
		return federation.ClusterStateDeleting
	default:
		return federation.ClusterStateUnknown
	}
}

// capiAvailableFromState derives a tri-state availability string from
// the lifecycle state. Provisioned clusters are "True"; failed ones
// are "False"; everything else is "Unknown".
func capiAvailableFromState(state federation.ClusterState) string {
	switch state {
	case federation.ClusterStateProvisioned:
		return "True"
	case federation.ClusterStateFailed:
		return "False"
	default:
		return "Unknown"
	}
}

func capiAPIServerURL(obj *unstructured.Unstructured) string {
	host, _, _ := unstructured.NestedString(obj.Object, "spec", "controlPlaneEndpoint", "host")
	port, found, _ := unstructured.NestedInt64(obj.Object, "spec", "controlPlaneEndpoint", "port")
	if host == "" {
		return ""
	}
	if !found || port == 0 {
		return fmt.Sprintf("https://%s", host)
	}
	return fmt.Sprintf("https://%s:%d", host, port)
}

func capiInfraRefKind(obj *unstructured.Unstructured) string {
	kind, _, _ := unstructured.NestedString(obj.Object, "spec", "infrastructureRef", "kind")
	return kind
}

// capiControlPlaneReady checks the Cluster status conditions first, then
// falls back to a matching KubeadmControlPlane.
func capiControlPlaneReady(obj *unstructured.Unstructured, kcpByCluster map[string]bool) bool {
	conditions, found, _ := unstructured.NestedSlice(obj.Object, "status", "conditions")
	if found {
		for _, c := range conditions {
			cond, ok := c.(map[string]interface{})
			if !ok {
				continue
			}
			condType, _ := cond["type"].(string)
			condStatus, _ := cond["status"].(string)
			if condType == "ControlPlaneReady" && condStatus == "True" {
				return true
			}
		}
	}
	// Fallback: check KubeadmControlPlane index.
	return kcpByCluster[obj.GetName()]
}

// ---------------------------------------------------------------------------
// MachineDeployment index
// ---------------------------------------------------------------------------

type capiMachineSummary struct {
	desired int32
	ready   int32
}

// capiIndexMachineDeployments lists all MachineDeployments and groups their
// replica counts by the cluster-name label.
func capiIndexMachineDeployments(ctx context.Context, dc dynamic.Interface) map[string]capiMachineSummary {
	out := map[string]capiMachineSummary{}
	list, err := dc.Resource(capiMachineDeploymentGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return out
	}
	for i := range list.Items {
		md := &list.Items[i]
		clusterName := md.GetLabels()[capiClusterNameLabel]
		if clusterName == "" {
			continue
		}
		desired, _, _ := unstructured.NestedInt64(md.Object, "spec", "replicas")
		ready, _, _ := unstructured.NestedInt64(md.Object, "status", "readyReplicas")
		summary := out[clusterName]
		summary.desired += safeInt64ToInt32(desired)
		summary.ready += safeInt64ToInt32(ready)
		out[clusterName] = summary
	}
	return out
}

// safeInt64ToInt32 converts int64 to int32 with clamping to prevent overflow.
func safeInt64ToInt32(v int64) int32 {
	if v > math.MaxInt32 {
		return math.MaxInt32
	}
	if v < math.MinInt32 {
		return math.MinInt32
	}
	return int32(v)
}

// ---------------------------------------------------------------------------
// KubeadmControlPlane index
// ---------------------------------------------------------------------------

// capiIndexKubeadmControlPlanes lists all KubeadmControlPlanes and builds a
// map[clusterName]ready boolean. If the CRD is absent, returns an empty map.
func capiIndexKubeadmControlPlanes(ctx context.Context, dc dynamic.Interface) map[string]bool {
	out := map[string]bool{}
	list, err := dc.Resource(capiKubeadmControlPlaneGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		return out
	}
	for i := range list.Items {
		kcp := &list.Items[i]
		clusterName := kcp.GetLabels()[capiClusterNameLabel]
		if clusterName == "" {
			continue
		}
		ready, _, _ := unstructured.NestedBool(kcp.Object, "status", "ready")
		if ready {
			out[clusterName] = true
		}
	}
	return out
}

// Ensure compile-time interface conformance.
var _ federation.Provider = (*capiProvider)(nil)
