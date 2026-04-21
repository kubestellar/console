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
	federation.Register(&kubeAdmiralProvider{})
}

var kubeAdmiralFederatedClusterGVR = schema.GroupVersionResource{
	Group:    "core.kubeadmiral.io",
	Version:  "v1alpha1",
	Resource: "federatedclusters",
}

const kubeAdmiralConditionReady = "Ready"

type kubeAdmiralProvider struct{}

func (p *kubeAdmiralProvider) Name() federation.FederationProviderName {
	return federation.ProviderKubeAdmiral
}

func (p *kubeAdmiralProvider) Detect(ctx context.Context, cfg *rest.Config) (federation.DetectResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.DetectResult{}, err
	}
	_, err = dc.Resource(kubeAdmiralFederatedClusterGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return federation.DetectResult{Detected: false}, nil
		}
		return federation.DetectResult{}, err
	}
	return federation.DetectResult{Detected: true, Version: "v1alpha1"}, nil
}

func (p *kubeAdmiralProvider) ReadClusters(ctx context.Context, cfg *rest.Config) ([]federation.FederatedCluster, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(kubeAdmiralFederatedClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.FederatedCluster, 0, len(list.Items))
	for i := range list.Items {
		fc := parseKubeAdmiralFederatedCluster(&list.Items[i])
		out = append(out, fc)
	}
	return out, nil
}

func (p *kubeAdmiralProvider) ReadGroups(ctx context.Context, cfg *rest.Config) ([]federation.FederatedGroup, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(kubeAdmiralFederatedClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	// Build synthetic groups from labels, similar to Clusternet. Group by
	// each unique label key-value pair.
	groups := map[string][]string{}
	for i := range list.Items {
		labels := list.Items[i].GetLabels()
		for k, v := range labels {
			groupKey := k + "=" + v
			groups[groupKey] = append(groups[groupKey], list.Items[i].GetName())
		}
	}

	out := make([]federation.FederatedGroup, 0, len(groups))
	for name, members := range groups {
		out = append(out, federation.FederatedGroup{
			Provider: federation.ProviderKubeAdmiral,
			Name:     name,
			Members:  members,
			Kind:     federation.FederatedGroupSelector,
		})
	}
	return out, nil
}

func (p *kubeAdmiralProvider) ReadPendingJoins(ctx context.Context, cfg *rest.Config) ([]federation.PendingJoin, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(kubeAdmiralFederatedClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.PendingJoin, 0)
	for i := range list.Items {
		obj := &list.Items[i]
		state := kubeAdmiralExtractState(obj)
		if state != federation.ClusterStatePending {
			continue
		}
		name := obj.GetName()
		createdAt := obj.GetCreationTimestamp().Time
		out = append(out, federation.PendingJoin{
			Provider:    federation.ProviderKubeAdmiral,
			ClusterName: name,
			RequestedAt: createdAt,
			Detail:      "FederatedCluster: " + name + " (Ready=False or missing)",
		})
	}
	return out, nil
}

func parseKubeAdmiralFederatedCluster(obj *unstructured.Unstructured) federation.FederatedCluster {
	name := obj.GetName()
	labels := obj.GetLabels()
	if labels == nil {
		labels = map[string]string{}
	}

	state := kubeAdmiralExtractState(obj)
	available := kubeAdmiralExtractAvailable(obj)
	apiServerURL, _, _ := unstructured.NestedString(obj.Object, "spec", "apiEndpoint")

	return federation.FederatedCluster{
		Provider:     federation.ProviderKubeAdmiral,
		Name:         name,
		State:        state,
		Available:    available,
		Labels:       labels,
		APIServerURL: apiServerURL,
		Raw:          obj.Object,
	}
}

func kubeAdmiralExtractState(obj *unstructured.Unstructured) federation.ClusterState {
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
		if condType == kubeAdmiralConditionReady {
			if condStatus == "True" {
				return federation.ClusterStateJoined
			}
			return federation.ClusterStatePending
		}
	}
	// Ready condition not present — treat as pending.
	return federation.ClusterStatePending
}

func kubeAdmiralExtractAvailable(obj *unstructured.Unstructured) string {
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
		if condType == kubeAdmiralConditionReady {
			return condStatus
		}
	}
	return "Unknown"
}

// Ensure compile-time interface conformance.
var _ federation.Provider = (*kubeAdmiralProvider)(nil)
