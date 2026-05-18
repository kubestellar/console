package models

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCardType_Constants(t *testing.T) {
	// Ensure string values match what the DB / API consumers expect.
	assert.Equal(t, CardType("cluster_health"), CardTypeClusterHealth)
	assert.Equal(t, CardType("app_status"), CardTypeAppStatus)
	assert.Equal(t, CardType("event_stream"), CardTypeEventStream)
	assert.Equal(t, CardType("deployment_progress"), CardTypeDeploymentProgress)
	assert.Equal(t, CardType("pod_issues"), CardTypePodIssues)
	assert.Equal(t, CardType("deployment_issues"), CardTypeDeploymentIssues)
	assert.Equal(t, CardType("top_pods"), CardTypeTopPods)
	assert.Equal(t, CardType("resource_capacity"), CardTypeResourceCapacity)
	assert.Equal(t, CardType("gitops_drift"), CardTypeGitOpsDrift)
	assert.Equal(t, CardType("security_issues"), CardTypeSecurityIssues)
	assert.Equal(t, CardType("rbac_overview"), CardTypeRBACOverview)
	assert.Equal(t, CardType("policy_violations"), CardTypePolicyViolations)
	assert.Equal(t, CardType("upgrade_status"), CardTypeUpgradeStatus)
	assert.Equal(t, CardType("namespace_analysis"), CardTypeNamespaceAnalysis)
}

func TestSwapStatus_Constants(t *testing.T) {
	assert.Equal(t, SwapStatus("pending"), SwapStatusPending)
	assert.Equal(t, SwapStatus("snoozed"), SwapStatusSnoozed)
	assert.Equal(t, SwapStatus("completed"), SwapStatusCompleted)
	assert.Equal(t, SwapStatus("cancelled"), SwapStatusCancelled)
}

func TestEventType_Constants(t *testing.T) {
	assert.Equal(t, EventType("card_focus"), EventTypeCardFocus)
	assert.Equal(t, EventType("card_expand"), EventTypeCardExpand)
	assert.Equal(t, EventType("card_action"), EventTypeCardAction)
	assert.Equal(t, EventType("card_hover"), EventTypeCardHover)
	assert.Equal(t, EventType("page_view"), EventTypePageView)
}

func TestGetCardTypes(t *testing.T) {
	types := GetCardTypes()

	t.Run("returns all 14 card types", func(t *testing.T) {
		require.Len(t, types, 14)
	})

	t.Run("no empty fields", func(t *testing.T) {
		for _, ct := range types {
			assert.NotEmpty(t, ct.Type, "card type %v has empty Type", ct)
			assert.NotEmpty(t, ct.Name, "card type %v has empty Name", ct)
			assert.NotEmpty(t, ct.Description, "card type %v has empty Description", ct)
			assert.NotEmpty(t, ct.Icon, "card type %v has empty Icon", ct)
			assert.NotEmpty(t, ct.KubestellarTool, "card type %v has empty KubestellarTool", ct)
		}
	})

	t.Run("types are unique", func(t *testing.T) {
		seen := make(map[CardType]bool)
		for _, ct := range types {
			assert.False(t, seen[ct.Type], "duplicate card type: %s", ct.Type)
			seen[ct.Type] = true
		}
	})

	t.Run("every constant is represented", func(t *testing.T) {
		all := []CardType{
			CardTypeClusterHealth, CardTypeAppStatus, CardTypeEventStream,
			CardTypeDeploymentProgress, CardTypePodIssues, CardTypeDeploymentIssues,
			CardTypeTopPods, CardTypeResourceCapacity, CardTypeGitOpsDrift,
			CardTypeSecurityIssues, CardTypeRBACOverview, CardTypePolicyViolations,
			CardTypeUpgradeStatus, CardTypeNamespaceAnalysis,
		}
		inRegistry := make(map[CardType]bool, len(types))
		for _, ct := range types {
			inRegistry[ct.Type] = true
		}
		for _, c := range all {
			assert.True(t, inRegistry[c], "constant %s missing from GetCardTypes()", c)
		}
	})
}
