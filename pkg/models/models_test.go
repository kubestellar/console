package models

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUserRole_Constants(t *testing.T) {
	// Verify role string values match expected database/JSON values
	require.Equal(t, UserRole("admin"), UserRoleAdmin)
	require.Equal(t, UserRole("editor"), UserRoleEditor)
	require.Equal(t, UserRole("viewer"), UserRoleViewer)
}

func TestUser_JSONSerialization(t *testing.T) {
	t.Run("marshal includes expected fields", func(t *testing.T) {
		user := User{
			GitHubID:    "12345",
			GitHubLogin: "testuser",
			Email:       "test@example.com",
			Role:        UserRoleAdmin,
			Onboarded:   true,
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		require.Equal(t, "12345", m["github_id"])
		require.Equal(t, "testuser", m["github_login"])
		require.Equal(t, "test@example.com", m["email"])
		require.Equal(t, "admin", m["role"])
		require.Equal(t, true, m["onboarded"])
	})

	t.Run("omitempty fields are absent when empty", func(t *testing.T) {
		user := User{
			GitHubID:    "12345",
			GitHubLogin: "testuser",
			Role:        UserRoleViewer,
		}

		data, err := json.Marshal(user)
		require.NoError(t, err)

		var m map[string]interface{}
		require.NoError(t, json.Unmarshal(data, &m))

		// email, slack_id, avatar_url are omitempty
		_, hasEmail := m["email"]
		require.False(t, hasEmail, "empty email should be omitted")
		_, hasSlack := m["slack_id"]
		require.False(t, hasSlack, "empty slack_id should be omitted")
		_, hasAvatar := m["avatar_url"]
		require.False(t, hasAvatar, "empty avatar_url should be omitted")
		_, hasLastLogin := m["last_login"]
		require.False(t, hasLastLogin, "nil last_login should be omitted")
	})
}

func TestDashboard_JSONSerialization(t *testing.T) {
	t.Run("layout is preserved as raw JSON", func(t *testing.T) {
		layout := json.RawMessage(`{"columns":3,"rows":2}`)
		dash := Dashboard{
			Name:      "Test Dashboard",
			Layout:    layout,
			IsDefault: true,
		}

		data, err := json.Marshal(dash)
		require.NoError(t, err)

		var decoded Dashboard
		require.NoError(t, json.Unmarshal(data, &decoded))
		require.Equal(t, "Test Dashboard", decoded.Name)
		require.JSONEq(t, `{"columns":3,"rows":2}`, string(decoded.Layout))
		require.True(t, decoded.IsDefault)
	})
}

func TestCardPosition_JSONSerialization(t *testing.T) {
	pos := CardPosition{X: 2, Y: 3, W: 4, H: 6}
	data, err := json.Marshal(pos)
	require.NoError(t, err)

	var decoded CardPosition
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, 2, decoded.X)
	require.Equal(t, 3, decoded.Y)
	require.Equal(t, 4, decoded.W)
	require.Equal(t, 6, decoded.H)
}

func TestCardType_Constants(t *testing.T) {
	// Verify key card type string values are correct for frontend compatibility
	tests := []struct {
		cardType CardType
		want     string
	}{
		{CardTypeClusterHealth, "cluster_health"},
		{CardTypeAppStatus, "app_status"},
		{CardTypeEventStream, "event_stream"},
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
		{CardTypeDeploymentProgress, "deployment_progress"},
	}

	for _, tc := range tests {
		t.Run(tc.want, func(t *testing.T) {
			require.Equal(t, CardType(tc.want), tc.cardType)
		})
	}
}

func TestSwapStatus_Constants(t *testing.T) {
	require.Equal(t, SwapStatus("pending"), SwapStatusPending)
	require.Equal(t, SwapStatus("snoozed"), SwapStatusSnoozed)
	require.Equal(t, SwapStatus("completed"), SwapStatusCompleted)
	require.Equal(t, SwapStatus("cancelled"), SwapStatusCancelled)
}

func TestEventType_Constants(t *testing.T) {
	require.Equal(t, EventType("card_focus"), EventTypeCardFocus)
	require.Equal(t, EventType("card_expand"), EventTypeCardExpand)
	require.Equal(t, EventType("card_action"), EventTypeCardAction)
	require.Equal(t, EventType("card_hover"), EventTypeCardHover)
	require.Equal(t, EventType("page_view"), EventTypePageView)
}

func TestGetCardTypes(t *testing.T) {
	types := GetCardTypes()
	require.NotEmpty(t, types)

	// Every card type info should have required fields populated
	for _, ct := range types {
		t.Run(string(ct.Type), func(t *testing.T) {
			require.NotEmpty(t, ct.Name, "card type name should not be empty")
			require.NotEmpty(t, ct.Description, "card type description should not be empty")
			require.NotEmpty(t, ct.Icon, "card type icon should not be empty")
			require.NotEmpty(t, ct.KubestellarTool, "card type tool should not be empty")
		})
	}
}

func TestGetOnboardingQuestions(t *testing.T) {
	questions := GetOnboardingQuestions()
	require.NotEmpty(t, questions)

	// Every question should have required fields
	for _, q := range questions {
		t.Run(q.Key, func(t *testing.T) {
			require.NotEmpty(t, q.Key, "question key should not be empty")
			require.NotEmpty(t, q.Question, "question text should not be empty")
			require.NotEmpty(t, q.Options, "question options should not be empty")
		})
	}
}

func TestRequestStatus_Constants(t *testing.T) {
	require.Equal(t, RequestStatus("open"), RequestStatusOpen)
	require.Equal(t, RequestStatus("needs_triage"), RequestStatusNeedsTriage)
	require.Equal(t, RequestStatus("triage_accepted"), RequestStatusTriageAccepted)
	require.Equal(t, RequestStatus("feasibility_study"), RequestStatusFeasibilityStudy)
	require.Equal(t, RequestStatus("ai_stuck"), RequestStatusAIStuck)
	require.Equal(t, RequestStatus("fix_ready"), RequestStatusFixReady)
	require.Equal(t, RequestStatus("fix_complete"), RequestStatusFixComplete)
	require.Equal(t, RequestStatus("unable_to_fix"), RequestStatusUnableToFix)
	require.Equal(t, RequestStatus("closed"), RequestStatusClosed)
}

func TestFeedbackType_Constants(t *testing.T) {
	require.Equal(t, FeedbackType("positive"), FeedbackTypePositive)
	require.Equal(t, FeedbackType("negative"), FeedbackTypeNegative)
}

func TestReservationStatus_Constants(t *testing.T) {
	require.Equal(t, ReservationStatus("pending"), ReservationStatusPending)
	require.Equal(t, ReservationStatus("active"), ReservationStatusActive)
	require.Equal(t, ReservationStatus("completed"), ReservationStatusCompleted)
	require.Equal(t, ReservationStatus("cancelled"), ReservationStatusCancelled)
}

func TestTargetRepo_Constants(t *testing.T) {
	require.Equal(t, TargetRepo("console"), TargetRepoConsole)
	require.Equal(t, TargetRepo("docs"), TargetRepoDocs)
}

func TestGPUReservation_JSONSerialization(t *testing.T) {
	res := GPUReservation{
		UserName:      "alice",
		Title:         "Training Run",
		Cluster:       "gpu-cluster-1",
		Namespace:     "ml",
		GPUCount:      4,
		GPUType:       "A100",
		DurationHours: 24,
		Status:        ReservationStatusActive,
	}

	data, err := json.Marshal(res)
	require.NoError(t, err)

	var m map[string]interface{}
	require.NoError(t, json.Unmarshal(data, &m))

	require.Equal(t, "alice", m["user_name"])
	require.Equal(t, "A100", m["gpu_type"])
	require.Equal(t, float64(4), m["gpu_count"])
	require.Equal(t, "active", m["status"])
}

// TestGPUReservation_NormalizeGPUTypes_LegacyPromotion pins the back-compat
// path used for reservations created before gpu-multitype — the migration
// leaves gpu_types empty and the scan must promote gpu_type into a
// one-element list so callers always see a populated GPUTypes slice.
func TestGPUReservation_NormalizeGPUTypes_LegacyPromotion(t *testing.T) {
	r := GPUReservation{GPUType: "NVIDIA A100"}
	r.NormalizeGPUTypes()
	require.Equal(t, []string{"NVIDIA A100"}, r.GPUTypes)
	require.Equal(t, "NVIDIA A100", r.GPUType)
}

// TestGPUReservation_NormalizeGPUTypes_MultiMirrors pins the forward path:
// once a multi-type reservation is created, the legacy singular field
// must mirror GPUTypes[0] so pre-migration clients keep reading a
// meaningful value.
func TestGPUReservation_NormalizeGPUTypes_MultiMirrors(t *testing.T) {
	r := GPUReservation{GPUTypes: []string{"NVIDIA A100", "NVIDIA H100"}}
	r.NormalizeGPUTypes()
	require.Equal(t, []string{"NVIDIA A100", "NVIDIA H100"}, r.GPUTypes)
	require.Equal(t, "NVIDIA A100", r.GPUType)
}

// TestGPUReservation_NormalizeGPUTypes_Dedup ensures duplicate and empty
// entries in the incoming list are scrubbed while preserving first-seen
// order — required so GPUType stays stable across normalize calls.
func TestGPUReservation_NormalizeGPUTypes_Dedup(t *testing.T) {
	r := GPUReservation{GPUTypes: []string{"A100", "", "A100", "H100", ""}}
	r.NormalizeGPUTypes()
	require.Equal(t, []string{"A100", "H100"}, r.GPUTypes)
	require.Equal(t, "A100", r.GPUType)
}

// TestGPUReservation_NormalizeGPUTypes_Empty covers the "no preference"
// case: neither singular nor multi is set. Both fields should stay
// zero-valued and the reservation must behave as any-GPU-acceptable.
func TestGPUReservation_NormalizeGPUTypes_Empty(t *testing.T) {
	r := GPUReservation{}
	r.NormalizeGPUTypes()
	require.Empty(t, r.GPUTypes)
	require.Equal(t, "", r.GPUType)
	// Any-type reservation matches every node.
	require.True(t, r.MatchesNodeGPUType("NVIDIA A100"))
	require.True(t, r.MatchesNodeGPUType(""))
}

// TestGPUReservation_MatchesNodeGPUType exercises the node-matching
// contract for the multi-type case: a reservation listing
// {A100, H100} must accept a node advertising either, but reject a
// node advertising a third type.
func TestGPUReservation_MatchesNodeGPUType(t *testing.T) {
	r := GPUReservation{GPUTypes: []string{"NVIDIA A100", "NVIDIA H100"}}
	r.NormalizeGPUTypes()
	require.True(t, r.MatchesNodeGPUType("NVIDIA A100-SXM4-80GB"))
	require.True(t, r.MatchesNodeGPUType("NVIDIA H100 PCIe"))
	require.False(t, r.MatchesNodeGPUType("NVIDIA V100"))
	require.False(t, r.MatchesNodeGPUType("AMD MI250"))
}

// TestGPUReservation_JSONRoundTrip_MultiType pins the wire format: a
// reservation with two types must serialize with both fields and
// deserialize back into the same shape so frontend and Netlify
// consumers can rely on gpu_types being present.
func TestGPUReservation_JSONRoundTrip_MultiType(t *testing.T) {
	original := GPUReservation{
		UserName:      "alice",
		Title:         "Multi-type Training",
		Cluster:       "gpu-cluster-1",
		Namespace:     "ml",
		GPUCount:      4,
		GPUType:       "NVIDIA A100",
		GPUTypes:      []string{"NVIDIA A100", "NVIDIA H100"},
		DurationHours: 24,
		Status:        ReservationStatusPending,
	}
	original.NormalizeGPUTypes()

	data, err := json.Marshal(original)
	require.NoError(t, err)

	var decoded GPUReservation
	require.NoError(t, json.Unmarshal(data, &decoded))

	require.Equal(t, []string{"NVIDIA A100", "NVIDIA H100"}, decoded.GPUTypes)
	require.Equal(t, "NVIDIA A100", decoded.GPUType)
}

func TestK8sSubjectKind_Constants(t *testing.T) {
	require.Equal(t, K8sSubjectKind("User"), K8sSubjectUser)
	require.Equal(t, K8sSubjectKind("Group"), K8sSubjectGroup)
	require.Equal(t, K8sSubjectKind("ServiceAccount"), K8sSubjectServiceAccount)
}

func TestFeatureRequest_JSONSerialization(t *testing.T) {
	issueNum := 42
	req := FeatureRequest{
		Title:             "Add dark mode",
		Description:       "Please add dark mode support",
		RequestType:       RequestTypeFeature,
		TargetRepo:        TargetRepoConsole,
		GitHubIssueNumber: &issueNum,
		Status:            RequestStatusOpen,
	}

	data, err := json.Marshal(req)
	require.NoError(t, err)

	var decoded FeatureRequest
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, "Add dark mode", decoded.Title)
	require.Equal(t, RequestTypeFeature, decoded.RequestType)
	require.NotNil(t, decoded.GitHubIssueNumber)
	require.Equal(t, 42, *decoded.GitHubIssueNumber)
}
