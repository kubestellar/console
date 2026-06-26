package providers

import (
	"context"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func init() {
	federation.Register(&ocmProvider{})
}

var (
	ocmManagedClusterGVR = schema.GroupVersionResource{
		Group:    "cluster.open-cluster-management.io",
		Version:  "v1",
		Resource: "managedclusters",
	}
	ocmManagedClusterSetGVR = schema.GroupVersionResource{
		Group:    "cluster.open-cluster-management.io",
		Version:  "v1beta2",
		Resource: "managedclustersets",
	}
	ocmCSRGVR = schema.GroupVersionResource{
		Group:    "certificates.k8s.io",
		Version:  "v1",
		Resource: "certificatesigningrequests",
	}
)

const (
	ocmCSRSignerPrefix     = "kubernetes.io/kube-apiserver-client"
	ocmCSRRequesterPrefix  = "system:open-cluster-management:"
	ocmClusterSetLabelKey  = "cluster.open-cluster-management.io/clusterset"
	ocmConditionJoined     = "ManagedClusterJoined"
	ocmConditionAvailable  = "ManagedClusterConditionAvailable"
	ocmAPIGroup            = "cluster.open-cluster-management.io"
)

type ocmProvider struct{}

func (p *ocmProvider) Name() federation.FederationProviderName {
	return federation.ProviderOCM
}

func (p *ocmProvider) Detect(ctx context.Context, cfg *rest.Config) (federation.DetectResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.DetectResult{}, err
	}
	_, err = dc.Resource(ocmManagedClusterGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return federation.DetectResult{Detected: false}, nil
		}
		return federation.DetectResult{}, err
	}
	return federation.DetectResult{Detected: true, Version: "v1"}, nil
}

func (p *ocmProvider) ReadClusters(ctx context.Context, cfg *rest.Config) ([]federation.FederatedCluster, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(ocmManagedClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.FederatedCluster, 0, len(list.Items))
	for i := range list.Items {
		fc := parseOCMManagedCluster(&list.Items[i])
		out = append(out, fc)
	}
	return out, nil
}

func (p *ocmProvider) ReadGroups(ctx context.Context, cfg *rest.Config) ([]federation.FederatedGroup, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(ocmManagedClusterSetGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.FederatedGroup, 0, len(list.Items))
	for i := range list.Items {
		name, _, _ := unstructured.NestedString(list.Items[i].Object, "metadata", "name")
		out = append(out, federation.FederatedGroup{
			Provider: federation.ProviderOCM,
			Name:     name,
			Members:  []string{},
			Kind:     federation.FederatedGroupSet,
		})
	}
	return out, nil
}

func (p *ocmProvider) ReadPendingJoins(ctx context.Context, cfg *rest.Config) ([]federation.PendingJoin, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(ocmCSRGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.PendingJoin, 0)
	for i := range list.Items {
		csr := &list.Items[i]
		if !isOCMPendingCSR(csr) {
			continue
		}
		name, _, _ := unstructured.NestedString(csr.Object, "metadata", "name")
		clusterName := extractOCMClusterFromCSR(csr)
		createdAt := csr.GetCreationTimestamp().Time
		out = append(out, federation.PendingJoin{
			Provider:    federation.ProviderOCM,
			ClusterName: clusterName,
			RequestedAt: createdAt,
			Detail:      "CSR: " + name,
		})
	}
	return out, nil
}

func parseOCMManagedCluster(obj *unstructured.Unstructured) federation.FederatedCluster {
	name := obj.GetName()
	labels := obj.GetLabels()
	if labels == nil {
		labels = map[string]string{}
	}

	state := ocmExtractState(obj)
	available := ocmExtractAvailable(obj)
	apiServerURL, _, _ := unstructured.NestedString(obj.Object, "spec", "managedClusterClientConfigs")
	if apiServerURL == "" {
		configs, found, _ := unstructured.NestedSlice(obj.Object, "spec", "managedClusterClientConfigs")
		if found && len(configs) > 0 {
			if cfgMap, ok := configs[0].(map[string]interface{}); ok {
				apiServerURL, _ = cfgMap["url"].(string)
			}
		}
	}

	clusterSet := labels[ocmClusterSetLabelKey]

	taints := ocmExtractTaints(obj)

	return federation.FederatedCluster{
		Provider:     federation.ProviderOCM,
		Name:         name,
		State:        state,
		Available:    available,
		ClusterSet:   clusterSet,
		Labels:       labels,
		APIServerURL: apiServerURL,
		Taints:       taints,
		Raw:          obj.Object,
	}
}

func ocmExtractState(obj *unstructured.Unstructured) federation.ClusterState {
	conditions, found, _ := unstructured.NestedSlice(obj.Object, "status", "conditions")
	if !found {
		return federation.ClusterStateUnknown
	}
	for _, c := range conditions {
		cond, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		condType, _ := cond["type"].(string)
		condStatus, _ := cond["status"].(string)
		if condType == ocmConditionJoined {
			if condStatus == "True" {
				return federation.ClusterStateJoined
			}
			return federation.ClusterStatePending
		}
	}
	accepted, _, _ := unstructured.NestedBool(obj.Object, "spec", "hubAcceptsClient")
	if !accepted {
		return federation.ClusterStatePending
	}
	return federation.ClusterStateJoined
}

func ocmExtractAvailable(obj *unstructured.Unstructured) string {
	conditions, found, _ := unstructured.NestedSlice(obj.Object, "status", "conditions")
	if !found {
		return "Unknown"
	}
	for _, c := range conditions {
		cond, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		condType, _ := cond["type"].(string)
		condStatus, _ := cond["status"].(string)
		if condType == ocmConditionAvailable {
			return condStatus
		}
	}
	return "Unknown"
}

func ocmExtractTaints(obj *unstructured.Unstructured) []federation.Taint {
	raw, found, _ := unstructured.NestedSlice(obj.Object, "spec", "taints")
	if !found || len(raw) == 0 {
		return nil
	}
	taints := make([]federation.Taint, 0, len(raw))
	for _, t := range raw {
		tm, ok := t.(map[string]interface{})
		if !ok {
			continue
		}
		key, _ := tm["key"].(string)
		value, _ := tm["value"].(string)
		effect, _ := tm["effect"].(string)
		taints = append(taints, federation.Taint{Key: key, Value: value, Effect: effect})
	}
	return taints
}

func isOCMPendingCSR(csr *unstructured.Unstructured) bool {
	requester, _, _ := unstructured.NestedString(csr.Object, "spec", "username")
	if !strings.HasPrefix(requester, ocmCSRRequesterPrefix) {
		return false
	}
	conditions, _, _ := unstructured.NestedSlice(csr.Object, "status", "conditions")
	for _, c := range conditions {
		cond, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		condType, _ := cond["type"].(string)
		if condType == "Approved" || condType == "Denied" {
			return false
		}
	}
	return true
}

func extractOCMClusterFromCSR(csr *unstructured.Unstructured) string {
	requester, _, _ := unstructured.NestedString(csr.Object, "spec", "username")
	parts := strings.Split(requester, ":")
	if len(parts) >= 4 {
		return parts[len(parts)-2]
	}
	name := csr.GetName()
	return name
}

func isNotFoundOrGroupNotFound(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "the server could not find the requested resource") ||
		strings.Contains(msg, "no matches for kind") ||
		strings.Contains(msg, "could not find the requested resource") ||
		strings.Contains(msg, "not found")
}

// Ensure compile-time interface conformance.
var _ federation.Provider = (*ocmProvider)(nil)
