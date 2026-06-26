package providers

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func init() {
	federation.Register(&karmadaProvider{})
}

var (
	karmadaClusterGVR = schema.GroupVersionResource{
		Group:    "cluster.karmada.io",
		Version:  "v1alpha1",
		Resource: "clusters",
	}
	karmadaPropagationPolicyGVR = schema.GroupVersionResource{
		Group:    "policy.karmada.io",
		Version:  "v1alpha1",
		Resource: "propagationpolicies",
	}
)

const (
	karmadaConditionReady = "Ready"
)

type karmadaProvider struct{}

func (p *karmadaProvider) Name() federation.FederationProviderName {
	return federation.ProviderKarmada
}

func (p *karmadaProvider) Detect(ctx context.Context, cfg *rest.Config) (federation.DetectResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.DetectResult{}, err
	}
	_, err = dc.Resource(karmadaClusterGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return federation.DetectResult{Detected: false}, nil
		}
		return federation.DetectResult{}, err
	}
	return federation.DetectResult{Detected: true, Version: "v1alpha1"}, nil
}

func (p *karmadaProvider) ReadClusters(ctx context.Context, cfg *rest.Config) ([]federation.FederatedCluster, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(karmadaClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.FederatedCluster, 0, len(list.Items))
	for i := range list.Items {
		fc := parseKarmadaCluster(&list.Items[i])
		out = append(out, fc)
	}
	return out, nil
}

func (p *karmadaProvider) ReadGroups(ctx context.Context, cfg *rest.Config) ([]federation.FederatedGroup, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(karmadaPropagationPolicyGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.FederatedGroup, 0, len(list.Items))
	for i := range list.Items {
		fg := parseKarmadaPropagationPolicy(&list.Items[i])
		out = append(out, fg)
	}
	return out, nil
}

func (p *karmadaProvider) ReadPendingJoins(ctx context.Context, cfg *rest.Config) ([]federation.PendingJoin, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(karmadaClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.PendingJoin, 0)
	for i := range list.Items {
		cluster := &list.Items[i]
		if karmadaExtractState(cluster) != federation.ClusterStatePending {
			continue
		}
		name := cluster.GetName()
		createdAt := cluster.GetCreationTimestamp().Time
		out = append(out, federation.PendingJoin{
			Provider:    federation.ProviderKarmada,
			ClusterName: name,
			RequestedAt: createdAt,
			Detail:      "Cluster Ready condition is not True",
		})
	}
	return out, nil
}

func parseKarmadaCluster(obj *unstructured.Unstructured) federation.FederatedCluster {
	name := obj.GetName()
	labels := obj.GetLabels()
	if labels == nil {
		labels = map[string]string{}
	}

	state := karmadaExtractState(obj)
	available := karmadaExtractAvailable(obj)
	apiServerURL, _, _ := unstructured.NestedString(obj.Object, "spec", "apiEndpoint")
	taints := karmadaExtractTaints(obj)

	return federation.FederatedCluster{
		Provider:     federation.ProviderKarmada,
		Name:         name,
		State:        state,
		Available:    available,
		Labels:       labels,
		APIServerURL: apiServerURL,
		Taints:       taints,
		Raw:          obj.Object,
	}
}

func karmadaExtractState(obj *unstructured.Unstructured) federation.ClusterState {
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
		if condType == karmadaConditionReady {
			if condStatus == "True" {
				return federation.ClusterStateJoined
			}
			return federation.ClusterStatePending
		}
	}
	return federation.ClusterStateUnknown
}

func karmadaExtractAvailable(obj *unstructured.Unstructured) string {
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
		if condType == karmadaConditionReady {
			return condStatus
		}
	}
	return "Unknown"
}

func karmadaExtractTaints(obj *unstructured.Unstructured) []federation.Taint {
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

func parseKarmadaPropagationPolicy(obj *unstructured.Unstructured) federation.FederatedGroup {
	name, _, _ := unstructured.NestedString(obj.Object, "metadata", "name")

	// Extract cluster names from spec.placement.clusterAffinity.clusterNames
	members := extractKarmadaClusterNames(obj)

	// Extract label selectors from spec.placement.clusterAffinity.labelSelector.matchLabels
	// and represent as synthetic selector group members if no explicit cluster names
	if len(members) == 0 {
		members = extractKarmadaSelectorMembers(obj)
	}

	return federation.FederatedGroup{
		Provider: federation.ProviderKarmada,
		Name:     name,
		Members:  members,
		Kind:     federation.FederatedGroupSelector,
	}
}

func extractKarmadaClusterNames(obj *unstructured.Unstructured) []string {
	raw, found, _ := unstructured.NestedSlice(obj.Object, "spec", "placement", "clusterAffinity", "clusterNames")
	if !found || len(raw) == 0 {
		return nil
	}
	names := make([]string, 0, len(raw))
	for _, r := range raw {
		if s, ok := r.(string); ok {
			names = append(names, s)
		}
	}
	return names
}

func extractKarmadaSelectorMembers(obj *unstructured.Unstructured) []string {
	matchLabels, found, _ := unstructured.NestedStringMap(
		obj.Object, "spec", "placement", "clusterAffinity", "labelSelector", "matchLabels",
	)
	if !found || len(matchLabels) == 0 {
		return []string{}
	}
	// Represent each matchLabel as "key=value" for display
	members := make([]string, 0, len(matchLabels))
	for k, v := range matchLabels {
		members = append(members, k+"="+v)
	}
	return members
}

// Ensure compile-time interface conformance.
var _ federation.Provider = (*karmadaProvider)(nil)
