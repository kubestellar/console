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
	federation.Register(&liqoProvider{})
}

var liqoForeignClusterGVR = schema.GroupVersionResource{
	Group:    "discovery.liqo.io",
	Version:  "v1alpha1",
	Resource: "foreignclusters",
}

const (
	// liqoPeeringConditionOutgoing is the condition type for an outgoing
	// peering relationship in ForeignCluster.status.peeringConditions.
	liqoPeeringConditionOutgoing = "OutgoingPeering"
	// liqoPeeringConditionIncoming is the condition type for an incoming
	// peering relationship in ForeignCluster.status.peeringConditions.
	liqoPeeringConditionIncoming = "IncomingPeering"
	// liqoPeeringStatusActive marks an active peering relationship.
	liqoPeeringStatusActive = "Active"
	// liqoPeersGroupName is the synthetic group name for all peered clusters.
	liqoPeersGroupName = "peers"
)

type liqoProvider struct{}

func (p *liqoProvider) Name() federation.FederationProviderName {
	return federation.ProviderLiqo
}

func (p *liqoProvider) Detect(ctx context.Context, cfg *rest.Config) (federation.DetectResult, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return federation.DetectResult{}, err
	}
	_, err = dc.Resource(liqoForeignClusterGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return federation.DetectResult{Detected: false}, nil
		}
		return federation.DetectResult{}, err
	}
	return federation.DetectResult{Detected: true, Version: "v1alpha1"}, nil
}

func (p *liqoProvider) ReadClusters(ctx context.Context, cfg *rest.Config) ([]federation.FederatedCluster, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(liqoForeignClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.FederatedCluster, 0, len(list.Items))
	for i := range list.Items {
		fc := parseLiqoForeignCluster(&list.Items[i])
		out = append(out, fc)
	}
	return out, nil
}

func (p *liqoProvider) ReadGroups(ctx context.Context, cfg *rest.Config) ([]federation.FederatedGroup, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(liqoForeignClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	// Liqo is peer-to-peer. Group all peered clusters into a single "peers"
	// group using the FederatedGroupPeer kind.
	members := make([]string, 0, len(list.Items))
	for i := range list.Items {
		if liqoIsPeeringActive(&list.Items[i]) {
			members = append(members, list.Items[i].GetName())
		}
	}

	if len(members) == 0 {
		return nil, nil
	}
	return []federation.FederatedGroup{{
		Provider: federation.ProviderLiqo,
		Name:     liqoPeersGroupName,
		Members:  members,
		Kind:     federation.FederatedGroupPeer,
	}}, nil
}

func (p *liqoProvider) ReadPendingJoins(ctx context.Context, cfg *rest.Config) ([]federation.PendingJoin, error) {
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}
	list, err := dc.Resource(liqoForeignClusterGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrGroupNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]federation.PendingJoin, 0)
	for i := range list.Items {
		obj := &list.Items[i]
		if liqoIsPeeringActive(obj) {
			continue
		}
		name := obj.GetName()
		createdAt := obj.GetCreationTimestamp().Time
		out = append(out, federation.PendingJoin{
			Provider:    federation.ProviderLiqo,
			ClusterName: name,
			RequestedAt: createdAt,
			Detail:      "ForeignCluster: " + name + " (peering not active)",
		})
	}
	return out, nil
}

func parseLiqoForeignCluster(obj *unstructured.Unstructured) federation.FederatedCluster {
	name := obj.GetName()
	labels := obj.GetLabels()
	if labels == nil {
		labels = map[string]string{}
	}

	active := liqoIsPeeringActive(obj)
	var state federation.ClusterState
	if active {
		state = federation.ClusterStateJoined
	} else {
		state = federation.ClusterStatePending
	}

	available := "Unknown"
	if active {
		available = "True"
	}

	// Liqo stores the remote endpoint in spec.foreignAuthURL or
	// spec.controlPlaneEndpoint depending on version.
	apiServerURL, _, _ := unstructured.NestedString(obj.Object, "spec", "controlPlaneEndpoint")
	if apiServerURL == "" {
		apiServerURL, _, _ = unstructured.NestedString(obj.Object, "spec", "foreignAuthURL")
	}

	return federation.FederatedCluster{
		Provider:     federation.ProviderLiqo,
		Name:         name,
		State:        state,
		Available:    available,
		Labels:       labels,
		APIServerURL: apiServerURL,
		Raw:          obj.Object,
	}
}

// liqoIsPeeringActive returns true when at least one peering direction
// (outgoing or incoming) is active in status.peeringConditions.
func liqoIsPeeringActive(obj *unstructured.Unstructured) bool {
	conditions, found, _ := unstructured.NestedSlice(obj.Object, "status", "peeringConditions")
	if !found {
		return false
	}
	for _, c := range conditions {
		cond, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		condType, _ := cond["type"].(string)
		condStatus, _ := cond["status"].(string)
		if (condType == liqoPeeringConditionOutgoing || condType == liqoPeeringConditionIncoming) &&
			condStatus == liqoPeeringStatusActive {
			return true
		}
	}
	return false
}

// Ensure compile-time interface conformance.
var _ federation.Provider = (*liqoProvider)(nil)
