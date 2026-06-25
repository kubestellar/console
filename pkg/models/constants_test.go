package models

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCardType_ConstantValues(t *testing.T) {
	tests := []struct {
		constant CardType
		expected string
	}{
		{CardTypeClusterHealth, "cluster_health"},
		{CardTypeAppStatus, "app_status"},
		{CardTypeEventStream, "event_stream"},
		{CardTypeDeploymentProgress, "deployment_progress"},
		{CardTypePodIssues, "pod_issues"},
		{CardTypeDeploymentIssues, "deployment_issues"},
		{CardTypeTopPods, "top_pods"},
		{CardTypeResourceCapacity, "resource_capacity"},
		{CardTypeGitOpsDrift, "gitops_drift"},
		{CardTypeSecurityIssues, "security_issues"},
		{CardTypeRBACOverview, "rbac_overview"},
		{CardTypePolicyViolations, "policy_violations"},
		{CardTypeUpgradeStatus, "upgrade_status"},
		{CardTypeNamespaceAnalysis, "namespace_analysis"},
	}

	for _, tt := range tests {
		t.Run(string(tt.constant), func(t *testing.T) {
			require.Equal(t, tt.expected, string(tt.constant))
		})
	}
}

func TestSwapStatus_ConstantValues(t *testing.T) {
	require.Equal(t, SwapStatus("pending"), SwapStatusPending)
	require.Equal(t, SwapStatus("snoozed"), SwapStatusSnoozed)
	require.Equal(t, SwapStatus("completed"), SwapStatusCompleted)
	require.Equal(t, SwapStatus("cancelled"), SwapStatusCancelled)
}

func TestEventType_ConstantValues(t *testing.T) {
	require.Equal(t, EventType("card_focus"), EventTypeCardFocus)
	require.Equal(t, EventType("card_expand"), EventTypeCardExpand)
	require.Equal(t, EventType("card_action"), EventTypeCardAction)
	require.Equal(t, EventType("card_hover"), EventTypeCardHover)
	require.Equal(t, EventType("page_view"), EventTypePageView)
}

func TestNotificationType_Constants(t *testing.T) {
	require.Equal(t, NotificationType("issue_created"), NotificationTypeIssueCreated)
	require.Equal(t, NotificationType("triage_accepted"), NotificationTypeTriageAccepted)
	require.Equal(t, NotificationType("feasibility_study"), NotificationTypeFeasibilityStudy)
	require.Equal(t, NotificationType("ai_stuck"), NotificationTypeAIStuck)
	require.Equal(t, NotificationType("fix_ready"), NotificationTypeFixReady)
	require.Equal(t, NotificationType("preview_ready"), NotificationTypePreviewReady)
	require.Equal(t, NotificationType("fix_complete"), NotificationTypeFixComplete)
	require.Equal(t, NotificationType("unable_to_fix"), NotificationTypeUnableToFix)
	require.Equal(t, NotificationType("closed"), NotificationTypeClosed)
	require.Equal(t, NotificationType("feedback_received"), NotificationTypeFeedbackReceived)
}

func TestRequestType_Constants(t *testing.T) {
	require.Equal(t, RequestType("bug"), RequestTypeBug)
	require.Equal(t, RequestType("feature"), RequestTypeFeature)
}

func TestGetCardTypes_Completeness(t *testing.T) {
	cardTypes := GetCardTypes()
	
	t.Run("all types are present", func(t *testing.T) {
		typeMap := make(map[CardType]bool)
		for _, ct := range cardTypes {
			typeMap[ct.Type] = true
		}
		
		expectedTypes := []CardType{
			CardTypeClusterHealth,
			CardTypeAppStatus,
			CardTypeEventStream,
			CardTypeDeploymentProgress,
			CardTypePodIssues,
			CardTypeDeploymentIssues,
			CardTypeTopPods,
			CardTypeResourceCapacity,
			CardTypeGitOpsDrift,
			CardTypeSecurityIssues,
			CardTypeRBACOverview,
			CardTypePolicyViolations,
			CardTypeUpgradeStatus,
			CardTypeNamespaceAnalysis,
		}
		
		for _, expected := range expectedTypes {
			require.True(t, typeMap[expected], "Expected card type %s not found", expected)
		}
	})

	t.Run("all metadata fields are populated", func(t *testing.T) {
		for _, ct := range cardTypes {
			require.NotEmpty(t, ct.Type, "Type should not be empty")
			require.NotEmpty(t, ct.Name, "Name should not be empty for %s", ct.Type)
			require.NotEmpty(t, ct.Description, "Description should not be empty for %s", ct.Type)
			require.NotEmpty(t, ct.Icon, "Icon should not be empty for %s", ct.Type)
			require.NotEmpty(t, ct.KubestellarTool, "KubestellarTool should not be empty for %s", ct.Type)
		}
	})

	t.Run("icons are valid", func(t *testing.T) {
		validIcons := map[string]bool{
			"heart": true, "app-window": true, "activity": true, "rocket": true,
			"alert-triangle": true, "alert-circle": true, "bar-chart-2": true,
			"cpu": true, "git-branch": true, "shield-alert": true, "key": true,
			"file-warning": true, "download": true, "folder": true,
		}
		
		for _, ct := range cardTypes {
			require.True(t, validIcons[ct.Icon], "Icon %s for %s should be valid", ct.Icon, ct.Type)
		}
	})
}

func TestCardPosition_DefaultValues(t *testing.T) {
	pos := CardPosition{}
	
	require.Equal(t, 0, pos.X)
	require.Equal(t, 0, pos.Y)
	require.Equal(t, 0, pos.W)
	require.Equal(t, 0, pos.H)
}

func TestCardPosition_SetValues(t *testing.T) {
	pos := CardPosition{X: 1, Y: 2, W: 3, H: 4}
	
	require.Equal(t, 1, pos.X)
	require.Equal(t, 2, pos.Y)
	require.Equal(t, 3, pos.W)
	require.Equal(t, 4, pos.H)
}
