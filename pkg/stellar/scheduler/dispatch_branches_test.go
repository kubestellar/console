package scheduler

import (
	"context"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

// TestDispatch_UnknownActionType covers the default arm of the Dispatch
// switch — a StellarAction whose ActionType matches no supported case
// must return an "unknown action type" error.
func TestDispatch_UnknownActionType(t *testing.T) {
	action := store.StellarAction{
		ID:         "u-1",
		ActionType: "SomeMysteryAction",
		Cluster:    "test-cluster",
		Parameters: `{}`,
	}
	mc := &k8s.MultiClusterClient{}
	mc.SetClient("test-cluster", nil)
	_, err := Dispatch(context.Background(), mc, action)
	if err == nil {
		t.Fatal("expected error for unknown action type, got nil")
	}
	if !strings.Contains(err.Error(), "unknown action type") {
		t.Fatalf("expected 'unknown action type' in error, got %q", err.Error())
	}
}

// TestDispatch_NilK8sClient covers the early-return guard that rejects
// a nil MultiClusterClient before dispatching any known action.
func TestDispatch_NilK8sClient(t *testing.T) {
	action := store.StellarAction{
		ID:         "n-1",
		ActionType: "DeletePod",
		Cluster:    "any",
		Parameters: `{}`,
	}
	_, err := Dispatch(context.Background(), nil, action)
	if err == nil {
		t.Fatal("expected error for nil k8s client, got nil")
	}
	if !strings.Contains(err.Error(), "k8s client is nil") {
		t.Fatalf("expected 'k8s client is nil' in error, got %q", err.Error())
	}
}

// TestDispatch_ScaleDeployment_InvalidReplicasType covers the readInt32
// error-return arm inside the ScaleDeployment case — replicas provided
// as a JSON object cannot be converted to int32.
func TestDispatch_ScaleDeployment_InvalidReplicasType(t *testing.T) {
	action := store.StellarAction{
		ID:         "s-1",
		ActionType: "ScaleDeployment",
		Cluster:    "test-cluster",
		Namespace:  "default",
		Parameters: `{"name":"web","replicas":{"nested":true}}`,
	}
	mc := &k8s.MultiClusterClient{}
	mc.SetClient("test-cluster", nil)
	_, err := Dispatch(context.Background(), mc, action)
	if err == nil {
		t.Fatal("expected error for invalid replicas type, got nil")
	}
	if !strings.Contains(err.Error(), "invalid replicas") {
		t.Fatalf("expected 'invalid replicas' in error, got %q", err.Error())
	}
}

// TestDispatch_ScaleDeployment_ReplicasNegative covers the lower-bound
// arm of the "replicas out of range" check.
func TestDispatch_ScaleDeployment_ReplicasNegative(t *testing.T) {
	action := store.StellarAction{
		ID:         "s-2",
		ActionType: "ScaleDeployment",
		Cluster:    "test-cluster",
		Namespace:  "default",
		Parameters: `{"name":"web","replicas":-1}`,
	}
	mc := &k8s.MultiClusterClient{}
	mc.SetClient("test-cluster", nil)
	_, err := Dispatch(context.Background(), mc, action)
	if err == nil {
		t.Fatal("expected error for negative replicas, got nil")
	}
	if !strings.Contains(err.Error(), "out of range") {
		t.Fatalf("expected 'out of range' in error, got %q", err.Error())
	}
}

// TestDispatch_ScaleDeployment_ReplicasTooHigh covers the upper-bound
// arm of the "replicas out of range" check.
func TestDispatch_ScaleDeployment_ReplicasTooHigh(t *testing.T) {
	action := store.StellarAction{
		ID:         "s-3",
		ActionType: "ScaleDeployment",
		Cluster:    "test-cluster",
		Namespace:  "default",
		Parameters: `{"name":"web","replicas":101}`,
	}
	mc := &k8s.MultiClusterClient{}
	mc.SetClient("test-cluster", nil)
	_, err := Dispatch(context.Background(), mc, action)
	if err == nil {
		t.Fatal("expected error for over-max replicas, got nil")
	}
	if !strings.Contains(err.Error(), "out of range") {
		t.Fatalf("expected 'out of range' in error, got %q", err.Error())
	}
}

// TestDispatch_DeleteCluster_RemoveContextError covers the DeleteCluster
// arm where confirm_token validation passes but RemoveContext returns an
// error (RemoveContext attempts to load a kubeconfig from disk that does
// not exist in this test's MultiClusterClient). This exercises the
// previously-uncovered "if err := k8sClient.RemoveContext(...)" branch.
func TestDispatch_DeleteCluster_RemoveContextError(t *testing.T) {
	actionID := "cluster-delete-req-42"
	action := store.StellarAction{
		ID:         actionID,
		ActionType: "DeleteCluster",
		Cluster:    "victim-cluster",
		Parameters: `{"confirm_token":"` + actionID[:8] + `"}`,
	}
	mc := &k8s.MultiClusterClient{}
	mc.SetClient("victim-cluster", nil)

	_, err := Dispatch(context.Background(), mc, action)
	if err == nil {
		t.Fatal("expected RemoveContext to fail without a kubeconfig, got nil")
	}
}

// TestDispatch_BadJSONParameters covers the decodeParameters error-return
// arm — malformed JSON in Parameters must fail before any dispatch happens.
func TestDispatch_BadJSONParameters(t *testing.T) {
	action := store.StellarAction{
		ID:         "b-1",
		ActionType: "DeletePod",
		Cluster:    "test-cluster",
		Parameters: `{not-json`,
	}
	mc := &k8s.MultiClusterClient{}
	mc.SetClient("test-cluster", nil)
	_, err := Dispatch(context.Background(), mc, action)
	if err == nil {
		t.Fatal("expected JSON decode error, got nil")
	}
}
