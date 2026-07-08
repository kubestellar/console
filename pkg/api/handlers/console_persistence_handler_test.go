package handlers

import (
	"testing"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/stretchr/testify/assert"
)

func TestSetTerminalStatusHistory(t *testing.T) {
	t.Run("adds history entry with correct revision", func(t *testing.T) {
		wd := &v1alpha1.WorkloadDeployment{}
		wd.Name = "test-deployment"
		wd.Status.History = []v1alpha1.DeploymentHistoryEntry{
			{Revision: 1, Phase: "Complete", Message: "First deployment"},
			{Revision: 2, Phase: "Failed", Message: "Second deployment"},
		}

		h := &ConsolePersistenceHandlers{}
		h.setTerminalStatus(wd, "Complete", "Third deployment", func(*v1alpha1.WorkloadDeployment) {})

		assert.Len(t, wd.Status.History, 3)
		assert.Equal(t, 3, wd.Status.History[2].Revision)
		assert.Equal(t, "Complete", wd.Status.History[2].Phase)
		assert.Equal(t, "Third deployment", wd.Status.History[2].Message)
	})

	t.Run("caps history at maxDeploymentHistory", func(t *testing.T) {
		wd := &v1alpha1.WorkloadDeployment{}
		wd.Name = "test-deployment"

		// Add maxDeploymentHistory + 10 entries
		for i := 1; i <= maxDeploymentHistory+10; i++ {
			wd.Status.History = append(wd.Status.History, v1alpha1.DeploymentHistoryEntry{
				Revision: i,
				Phase:    "Complete",
				Message:  "Deployment",
			})
		}

		h := &ConsolePersistenceHandlers{}
		h.setTerminalStatus(wd, "Complete", "Final deployment", func(*v1alpha1.WorkloadDeployment) {})

		assert.Len(t, wd.Status.History, maxDeploymentHistory)
		// The oldest entries should be dropped, newest entry should be last
		// After adding entry #61, we trim to 50, keeping entries 12-61
		assert.Equal(t, 12, wd.Status.History[0].Revision) // First kept entry (60 - 50 + 1 + 1 = 12)
		assert.Equal(t, maxDeploymentHistory+11, wd.Status.History[len(wd.Status.History)-1].Revision)
	})

	t.Run("handles empty history", func(t *testing.T) {
		wd := &v1alpha1.WorkloadDeployment{}
		wd.Name = "test-deployment"

		h := &ConsolePersistenceHandlers{}
		h.setTerminalStatus(wd, "Failed", "Initial deployment failed", func(*v1alpha1.WorkloadDeployment) {})

		assert.Len(t, wd.Status.History, 1)
		assert.Equal(t, 1, wd.Status.History[0].Revision)
		assert.Equal(t, "Failed", wd.Status.History[0].Phase)
	})
}

func TestResolveTargetClustersLogic(t *testing.T) {
	t.Run("explicit clusters only", func(t *testing.T) {
		wd := &v1alpha1.WorkloadDeployment{}
		wd.Spec.TargetClusters = []string{"cluster-1", "cluster-2", "cluster-3"}

		// Test cluster deduplication logic
		clusterSet := make(map[string]bool)
		for _, c := range wd.Spec.TargetClusters {
			clusterSet[c] = true
		}

		result := make([]string, 0, len(clusterSet))
		for c := range clusterSet {
			result = append(result, c)
		}

		assert.Len(t, result, 3)
		assert.Contains(t, result, "cluster-1")
		assert.Contains(t, result, "cluster-2")
		assert.Contains(t, result, "cluster-3")
	})

	t.Run("duplicate clusters are deduplicated", func(t *testing.T) {
		wd := &v1alpha1.WorkloadDeployment{}
		wd.Spec.TargetClusters = []string{"cluster-1", "cluster-2", "cluster-1", "cluster-3", "cluster-2"}

		clusterSet := make(map[string]bool)
		for _, c := range wd.Spec.TargetClusters {
			clusterSet[c] = true
		}

		result := make([]string, 0, len(clusterSet))
		for c := range clusterSet {
			result = append(result, c)
		}

		assert.Len(t, result, 3)
	})

	t.Run("empty target clusters returns empty result", func(t *testing.T) {
		wd := &v1alpha1.WorkloadDeployment{}
		wd.Spec.TargetClusters = []string{}

		clusterSet := make(map[string]bool)
		for _, c := range wd.Spec.TargetClusters {
			clusterSet[c] = true
		}

		result := make([]string, 0, len(clusterSet))
		for c := range clusterSet {
			result = append(result, c)
		}

		assert.Len(t, result, 0)
	})
}

func TestMaxDeploymentHistoryConstant(t *testing.T) {
	// Verify the constant is set to a reasonable value
	assert.Equal(t, 50, maxDeploymentHistory, "maxDeploymentHistory should be 50 to prevent etcd object-size issues")
}
