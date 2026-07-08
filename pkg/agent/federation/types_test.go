package federation

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFederationError_Error(t *testing.T) {
	tests := []struct {
		name     string
		err      *FederationError
		expected string
	}{
		{
			name: "auth error",
			err: &FederationError{
				Provider:   ProviderOCM,
				HubContext: "prod-cluster",
				Type:       ClusterErrorAuth,
				Message:    "invalid credentials",
			},
			expected: "auth: invalid credentials",
		},
		{
			name: "timeout error",
			err: &FederationError{
				Provider:   ProviderKarmada,
				HubContext: "test-hub",
				Type:       ClusterErrorTimeout,
				Message:    "context deadline exceeded",
			},
			expected: "timeout: context deadline exceeded",
		},
		{
			name: "network error",
			err: &FederationError{
				Provider:   ProviderClusternet,
				HubContext: "dev-cluster",
				Type:       ClusterErrorNetwork,
				Message:    "connection refused",
			},
			expected: "network: connection refused",
		},
		{
			name: "certificate error",
			err: &FederationError{
				Provider:   ProviderLiqo,
				HubContext: "staging",
				Type:       ClusterErrorCertificate,
				Message:    "x509: certificate has expired",
			},
			expected: "certificate: x509: certificate has expired",
		},
		{
			name: "not installed error",
			err: &FederationError{
				Provider:   ProviderKubeAdmiral,
				HubContext: "local",
				Type:       ClusterErrorNotInstalled,
				Message:    "CRDs not found",
			},
			expected: "not-installed: CRDs not found",
		},
		{
			name: "unknown error",
			err: &FederationError{
				Provider:   ProviderCAPI,
				HubContext: "cluster-1",
				Type:       ClusterErrorUnknown,
				Message:    "unexpected failure",
			},
			expected: "unknown: unexpected failure",
		},
		{
			name:     "nil error",
			err:      nil,
			expected: "",
		},
		{
			name: "empty message",
			err: &FederationError{
				Provider:   ProviderOCM,
				HubContext: "test",
				Type:       ClusterErrorAuth,
				Message:    "",
			},
			expected: "auth: ",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.err.Error()
			require.Equal(t, tt.expected, result)
		})
	}
}

func TestFederationProviderName_Constants(t *testing.T) {
	require.Equal(t, FederationProviderName("ocm"), ProviderOCM)
	require.Equal(t, FederationProviderName("karmada"), ProviderKarmada)
	require.Equal(t, FederationProviderName("clusternet"), ProviderClusternet)
	require.Equal(t, FederationProviderName("liqo"), ProviderLiqo)
	require.Equal(t, FederationProviderName("kubeadmiral"), ProviderKubeAdmiral)
	require.Equal(t, FederationProviderName("capi"), ProviderCAPI)
}

func TestClusterState_Constants(t *testing.T) {
	require.Equal(t, ClusterState("joined"), ClusterStateJoined)
	require.Equal(t, ClusterState("pending"), ClusterStatePending)
	require.Equal(t, ClusterState("unknown"), ClusterStateUnknown)
	require.Equal(t, ClusterState("not-member"), ClusterStateNotMember)
	require.Equal(t, ClusterState("provisioning"), ClusterStateProvisioning)
	require.Equal(t, ClusterState("provisioned"), ClusterStateProvisioned)
	require.Equal(t, ClusterState("failed"), ClusterStateFailed)
	require.Equal(t, ClusterState("deleting"), ClusterStateDeleting)
}

func TestClusterErrorType_Constants(t *testing.T) {
	require.Equal(t, ClusterErrorType("auth"), ClusterErrorAuth)
	require.Equal(t, ClusterErrorType("timeout"), ClusterErrorTimeout)
	require.Equal(t, ClusterErrorType("network"), ClusterErrorNetwork)
	require.Equal(t, ClusterErrorType("certificate"), ClusterErrorCertificate)
	require.Equal(t, ClusterErrorType("not-installed"), ClusterErrorNotInstalled)
	require.Equal(t, ClusterErrorType("unknown"), ClusterErrorUnknown)
}

func TestFederatedGroupKind_Constants(t *testing.T) {
	require.Equal(t, FederatedGroupKind("set"), FederatedGroupSet)
	require.Equal(t, FederatedGroupKind("selector"), FederatedGroupSelector)
	require.Equal(t, FederatedGroupKind("peer"), FederatedGroupPeer)
	require.Equal(t, FederatedGroupKind("infra"), FederatedGroupInfra)
}

func TestLifecycle_DefaultValues(t *testing.T) {
	lifecycle := Lifecycle{
		Phase:               "Provisioned",
		ControlPlaneReady:   true,
		InfrastructureReady: true,
		DesiredMachines:     3,
		ReadyMachines:       3,
	}

	require.Equal(t, "Provisioned", lifecycle.Phase)
	require.True(t, lifecycle.ControlPlaneReady)
	require.True(t, lifecycle.InfrastructureReady)
	require.Equal(t, int32(3), lifecycle.DesiredMachines)
	require.Equal(t, int32(3), lifecycle.ReadyMachines)
}

func TestFederatedCluster_Fields(t *testing.T) {
	cluster := FederatedCluster{
		Provider:     ProviderOCM,
		HubContext:   "prod-hub",
		Name:         "cluster-1",
		State:        ClusterStateJoined,
		Available:    "True",
		ClusterSet:   "production",
		Labels:       map[string]string{"env": "prod"},
		APIServerURL: "https://api.cluster-1.example.com:6443",
		Taints: []Taint{
			{Key: "gpu", Value: "true", Effect: "NoSchedule"},
		},
		Lifecycle: &Lifecycle{
			Phase:               "Provisioned",
			ControlPlaneReady:   true,
			InfrastructureReady: true,
			DesiredMachines:     5,
			ReadyMachines:       5,
		},
	}

	require.Equal(t, ProviderOCM, cluster.Provider)
	require.Equal(t, "prod-hub", cluster.HubContext)
	require.Equal(t, "cluster-1", cluster.Name)
	require.Equal(t, ClusterStateJoined, cluster.State)
	require.Equal(t, "True", cluster.Available)
	require.Equal(t, "production", cluster.ClusterSet)
	require.Equal(t, "prod", cluster.Labels["env"])
	require.Equal(t, "https://api.cluster-1.example.com:6443", cluster.APIServerURL)
	require.Len(t, cluster.Taints, 1)
	require.Equal(t, "gpu", cluster.Taints[0].Key)
	require.NotNil(t, cluster.Lifecycle)
	require.Equal(t, int32(5), cluster.Lifecycle.ReadyMachines)
}

func TestTaint_Fields(t *testing.T) {
	taint := Taint{
		Key:    "dedicated",
		Value:  "ml-workload",
		Effect: "NoSchedule",
	}

	require.Equal(t, "dedicated", taint.Key)
	require.Equal(t, "ml-workload", taint.Value)
	require.Equal(t, "NoSchedule", taint.Effect)
}

func TestFederatedGroup_Fields(t *testing.T) {
	group := FederatedGroup{
		Provider:   ProviderKarmada,
		HubContext: "karmada-hub",
		Name:       "production-clusters",
		Members:    []string{"cluster-1", "cluster-2", "cluster-3"},
		Kind:       FederatedGroupSet,
	}

	require.Equal(t, ProviderKarmada, group.Provider)
	require.Equal(t, "karmada-hub", group.HubContext)
	require.Equal(t, "production-clusters", group.Name)
	require.Len(t, group.Members, 3)
	require.Equal(t, FederatedGroupSet, group.Kind)
}

func TestDetectResult_Fields(t *testing.T) {
	result := DetectResult{
		Detected: true,
		Version:  "v1.2.3",
	}

	require.True(t, result.Detected)
	require.Equal(t, "v1.2.3", result.Version)
}
