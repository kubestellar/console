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
	federation.Register(&clusternetProvider{})
}

var clusternetManagedClusterGVR = schema.GroupVersionResource{
	Group:    "clusters.clusternet.io",
	Version:  "v1beta1",
	Resource: "managedclusters",
}

const (
	clusternetConditionReady    = "Ready"
	clusternetClusterIDLabelKey = "clusternet.io/cluster-id"
)

type clusternetProvider struct{}

func (p *clusternetProvider) Name() federation.FederationProviderName {
	return federation.ProviderClusternet
}

func (p *clusternetProvider) Detect(ctx context.Context, cfg *rest.Config) (federation.DetectResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.DetectResult{}, err
	}
	_, err = dc.Resource(clusternetManagedClusterGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return federation.DetectResult{Detected: false}, nil
		}
		return federation.DetectResult{}, err
	}
	return federation.DetectResult{Detected: true, Version: "v1beta1"}, nil
}

func (p *clusternetProvider) ReadClusters(ctx context.Context, cfg *rest.Config) ([]federation.FederatedCluster, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(clusternetManagedClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.FederatedCluster, 0, len(list.Items))
	for i := range list.Items {
		fc := parseClusternetManagedCluster(&list.Items[i])
		out = append(out, fc)
	}
	return out, nil
}

func (p *clusternetProvider) ReadGroups(ctx context.Context, cfg *rest.Config) ([]federation.FederatedGroup, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(clusternetManagedClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	// Build synthetic groups from common label keys. Clusters that share the
	// same clusternet.io/cluster-id label value are grouped together.
	groups := map[string][]string{}
	for i := range list.Items {
		labels := list.Items[i].GetLabels()
		if labels == nil {
			continue
		}
		if id, ok := labels[clusternetClusterIDLabelKey]; ok {
			groups[id] = append(groups[id], list.Items[i].GetName())
		}
	}

	out := make([]federation.FederatedGroup, 0, len(groups))
	for id, members := range groups {
		out = append(out, federation.FederatedGroup{
			Provider: federation.ProviderClusternet,
			Name:     id,
			Members:  members,
			Kind:     federation.FederatedGroupSelector,
		})
	}
	return out, nil
}

func (p *clusternetProvider) ReadPendingJoins(ctx context.Context, cfg *rest.Config) ([]federation.PendingJoin, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(clusternetManagedClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.PendingJoin, 0)
	for i := range list.Items {
		obj := &list.Items[i]
		state := clusternetExtractState(obj)
		if state != federation.ClusterStatePending {
			continue
		}
		name := obj.GetName()
		createdAt := obj.GetCreationTimestamp().Time
		out = append(out, federation.PendingJoin{
			Provider:    federation.ProviderClusternet,
			ClusterName: name,
			RequestedAt: createdAt,
			Detail:      "ManagedCluster: " + name + " (Ready=False or missing)",
		})
	}
	return out, nil
}

func parseClusternetManagedCluster(obj *unstructured.Unstructured) federation.FederatedCluster {
	name := obj.GetName()
	labels := obj.GetLabels()
	if labels == nil {
		labels = map[string]string{}
	}

	state := clusternetExtractState(obj)
	available := clusternetExtractAvailable(obj)
	apiServerURL, _, _ := unstructured.NestedString(obj.Object, "status", "apiServerURL")

	clusterSet := labels[clusternetClusterIDLabelKey]

	return federation.FederatedCluster{
		Provider:     federation.ProviderClusternet,
		Name:         name,
		State:        state,
		Available:    available,
		ClusterSet:   clusterSet,
		Labels:       labels,
		APIServerURL: apiServerURL,
		Raw:          obj.Object,
	}
}

func clusternetExtractState(obj *unstructured.Unstructured) federation.ClusterState {
	conditions, found, _ := unstructured.NestedSlice(obj.Object, "status", "conditions")
	if !found {
		return federation.ClusterStatePending
	}
	for _, c := range conditions {
		cond, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		condType, _ := cond["type"].(string)
		condStatus, _ := cond["status"].(string)
		if condType == clusternetConditionReady {
			if condStatus == "True" {
				return federation.ClusterStateJoined
			}
			return federation.ClusterStatePending
		}
	}
	// Ready condition not found — treat as pending.
	return federation.ClusterStatePending
}

func clusternetExtractAvailable(obj *unstructured.Unstructured) string {
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
		if condType == clusternetConditionReady {
			return condStatus
		}
	}
	return "Unknown"
}

// Ensure compile-time interface conformance.
var _ federation.Provider = (*clusternetProvider)(nil)
