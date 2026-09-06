package providers

import (
	"context"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// This suite drives each provider's Execute() dispatcher through every known
// ActionID happy-path arm. Existing tests exercise the underlying execute*/
// action helper functions directly, which bypasses the switch in Execute and
// leaves the dispatch arms uncovered (karmada/capi Execute = 40%, ocm = 33%,
// clusternet = 50%).
//
// The tested handlers all validate their required inputs before dereferencing
// the *rest.Config, so we can drive Execute with nil cfg and empty request
// payloads to reach each dispatch arm and exit through the handler's early
// validation error. The dispatch line is what matters for coverage; the
// resulting error is what proves the correct arm ran.

func TestKarmadaProvider_Execute_DispatchArms(t *testing.T) {
	p := &karmadaProvider{}
	cases := []struct {
		actionID    string
		wantErrText string
	}{
		{karmadaActionJoinCluster, "clusterName is required"},
		{karmadaActionUnjoinCluster, "clusterName is required"},
		{karmadaActionTaintCluster, "clusterName is required"},
	}
	for _, tc := range cases {
		t.Run(tc.actionID, func(t *testing.T) {
			_, err := p.Execute(context.Background(), nil, federation.ActionRequest{ActionID: tc.actionID})
			if err == nil {
				t.Fatalf("expected validation error for %s dispatch, got nil", tc.actionID)
			}
			if !strings.Contains(err.Error(), tc.wantErrText) {
				t.Fatalf("expected error containing %q, got %q", tc.wantErrText, err.Error())
			}
		})
	}
}

func TestCAPIProvider_Execute_DispatchArms(t *testing.T) {
	p := &capiProvider{}
	cases := []struct {
		actionID    string
		wantErrText string
	}{
		{capiActionScaleMachineDeployment, "payload.name, payload.namespace, and payload.replicas are required"},
		{capiActionDeleteCluster, "clusterName is required"},
		{capiActionRetryProvisioning, "clusterName is required"},
	}
	for _, tc := range cases {
		t.Run(tc.actionID, func(t *testing.T) {
			_, err := p.Execute(context.Background(), nil, federation.ActionRequest{ActionID: tc.actionID})
			if err == nil {
				t.Fatalf("expected validation error for %s dispatch, got nil", tc.actionID)
			}
			if !strings.Contains(err.Error(), tc.wantErrText) {
				t.Fatalf("expected error containing %q, got %q", tc.wantErrText, err.Error())
			}
		})
	}
}

func TestClusternetProvider_Execute_DispatchArms(t *testing.T) {
	p := &clusternetProvider{}
	cases := []struct {
		actionID    string
		wantErrText string
	}{
		{clusternetActionApproveCluster, "rest config is nil"},
		{clusternetActionUnregisterCluster, "rest config is nil"},
	}
	for _, tc := range cases {
		t.Run(tc.actionID, func(t *testing.T) {
			_, err := p.Execute(context.Background(), nil, federation.ActionRequest{ActionID: tc.actionID, ClusterName: "c1"})
			if err == nil {
				t.Fatalf("expected error for %s dispatch, got nil", tc.actionID)
			}
			if !strings.Contains(err.Error(), tc.wantErrText) {
				t.Fatalf("expected error containing %q, got %q", tc.wantErrText, err.Error())
			}
		})
	}
}

func TestOCMProvider_Execute_DispatchArms(t *testing.T) {
	p := &ocmProvider{}
	cases := []struct {
		actionID    string
		wantErrText string
	}{
		{ocmActionApproveCSR, "payload.csrName is required"},
		{ocmActionAcceptCluster, "clusterName is required"},
		{ocmActionDetachCluster, "clusterName is required"},
		{ocmActionTaintCluster, "clusterName is required"},
	}
	for _, tc := range cases {
		t.Run(tc.actionID, func(t *testing.T) {
			_, err := p.Execute(context.Background(), nil, federation.ActionRequest{ActionID: tc.actionID})
			if err == nil {
				t.Fatalf("expected validation error for %s dispatch, got nil", tc.actionID)
			}
			if !strings.Contains(err.Error(), tc.wantErrText) {
				t.Fatalf("expected error containing %q, got %q", tc.wantErrText, err.Error())
			}
		})
	}
}
