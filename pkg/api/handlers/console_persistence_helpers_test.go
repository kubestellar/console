package handlers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ---------- setTerminalStatus ----------

func TestSetTerminalStatus(t *testing.T) {
	cases := []struct {
		name            string
		initialHistory  []v1alpha1.DeploymentHistoryEntry
		phase           string
		message         string
		wantRevision    int
		wantHistoryLen  int
		wantUpdateCalls int
	}{
		{
			name:            "empty history gets revision 1",
			initialHistory:  nil,
			phase:           "Complete",
			message:         "all done",
			wantRevision:    1,
			wantHistoryLen:  1,
			wantUpdateCalls: 1,
		},
		{
			name: "increments max existing revision",
			initialHistory: []v1alpha1.DeploymentHistoryEntry{
				{Revision: 1, Phase: "Failed"},
				{Revision: 3, Phase: "Failed"},
			},
			phase:           "Complete",
			message:         "success",
			wantRevision:    4,
			wantHistoryLen:  3,
			wantUpdateCalls: 1,
		},
		{
			name:            "caps history at maxDeploymentHistory",
			initialHistory:  makeHistoryEntries(maxDeploymentHistory),
			phase:           "Failed",
			message:         "cap test",
			wantRevision:    maxDeploymentHistory + 1,
			wantHistoryLen:  maxDeploymentHistory,
			wantUpdateCalls: 1,
		},
		{
			name:            "oversized history trimmed to max",
			initialHistory:  makeHistoryEntries(maxDeploymentHistory + 10),
			phase:           "Failed",
			message:         "overflow",
			wantRevision:    maxDeploymentHistory + 11,
			wantHistoryLen:  maxDeploymentHistory,
			wantUpdateCalls: 1,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := &ConsolePersistenceHandlers{}
			wd := &v1alpha1.WorkloadDeployment{
				ObjectMeta: metav1.ObjectMeta{Name: "test-wd"},
				Status: v1alpha1.WorkloadDeploymentStatus{
					History: tc.initialHistory,
				},
			}

			updateCalls := 0
			h.setTerminalStatus(wd, tc.phase, tc.message, func(w *v1alpha1.WorkloadDeployment) {
				updateCalls++
			})

			assert.Equal(t, tc.phase, wd.Status.Phase)
			assert.NotNil(t, wd.Status.CompletedAt)
			require.Len(t, wd.Status.History, tc.wantHistoryLen)
			assert.Equal(t, tc.wantUpdateCalls, updateCalls)

			// Check the last entry has the expected revision
			lastEntry := wd.Status.History[len(wd.Status.History)-1]
			assert.Equal(t, tc.wantRevision, lastEntry.Revision)
			assert.Equal(t, tc.phase, lastEntry.Phase)
			assert.Equal(t, tc.message, lastEntry.Message)
		})
	}
}

// makeHistoryEntries creates n history entries with sequential revisions.
func makeHistoryEntries(n int) []v1alpha1.DeploymentHistoryEntry {
	entries := make([]v1alpha1.DeploymentHistoryEntry, n)
	for i := range entries {
		entries[i] = v1alpha1.DeploymentHistoryEntry{
			Revision: i + 1,
			Phase:    "Failed",
			Message:  "historic failure",
		}
	}
	return entries
}

// ---------- checkClusterHealth ----------

func TestCheckClusterHealth_NilClient(t *testing.T) {
	h := &ConsolePersistenceHandlers{k8sClient: nil}
	result := h.checkClusterHealth(context.Background(), "any-cluster")
	assert.Equal(t, "unknown", string(result))
}
