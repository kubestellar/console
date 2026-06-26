package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

// ────────────────────────────────────────────────────────────────────
// rbac.go tests
// ────────────────────────────────────────────────────────────────────

func TestUserRoleConstants(t *testing.T) {
	tests := []struct {
		role UserRole
		want string
	}{
		{UserRoleAdmin, "admin"},
		{UserRoleEditor, "editor"},
		{UserRoleViewer, "viewer"},
	}
	for _, tt := range tests {
		if string(tt.role) != tt.want {
			t.Errorf("UserRole = %q, want %q", tt.role, tt.want)
		}
	}
}

func TestK8sSubjectKindConstants(t *testing.T) {
	tests := []struct {
		kind K8sSubjectKind
		want string
	}{
		{K8sSubjectUser, "User"},
		{K8sSubjectGroup, "Group"},
		{K8sSubjectServiceAccount, "ServiceAccount"},
	}
	for _, tt := range tests {
		if string(tt.kind) != tt.want {
			t.Errorf("K8sSubjectKind = %q, want %q", tt.kind, tt.want)
		}
	}
}

func TestK8sUserJSON(t *testing.T) {
	u := K8sUser{
		Kind:      K8sSubjectServiceAccount,
		Name:      "default",
		Namespace: "kube-system",
		Cluster:   "prod",
	}
	data, err := json.Marshal(u)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded K8sUser
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.Kind != K8sSubjectServiceAccount {
		t.Errorf("Kind = %q", decoded.Kind)
	}
	if decoded.Namespace != "kube-system" {
		t.Errorf("Namespace = %q", decoded.Namespace)
	}
}

func TestK8sRoleJSON(t *testing.T) {
	r := K8sRole{
		Name:      "cluster-admin",
		Cluster:   "prod",
		IsCluster: true,
		RuleCount: 1,
	}
	data, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded K8sRole
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if !decoded.IsCluster {
		t.Error("expected IsCluster = true")
	}
	if decoded.Namespace != "" {
		t.Errorf("expected empty namespace for ClusterRole, got %q", decoded.Namespace)
	}
}

func TestClusterPermissionsJSON(t *testing.T) {
	cp := ClusterPermissions{
		Cluster:        "prod",
		IsClusterAdmin: true,
		CanCreateSA:    true,
		CanManageRBAC:  true,
		CanViewSecrets: false,
	}
	data, err := json.Marshal(cp)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded ClusterPermissions
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if !decoded.IsClusterAdmin {
		t.Error("expected IsClusterAdmin = true")
	}
	if decoded.CanViewSecrets {
		t.Error("expected CanViewSecrets = false")
	}
}

func TestOpenShiftUserOmitsZeroTime(t *testing.T) {
	u := OpenShiftUser{
		Name:    "admin",
		Cluster: "ocp",
	}
	data, err := json.Marshal(u)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	// CreatedAt is a pointer, so omitempty should omit it when nil
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if _, ok := m["createdAt"]; ok {
		t.Error("expected createdAt to be omitted when nil")
	}
}

// ────────────────────────────────────────────────────────────────────
// feedback.go tests
// ────────────────────────────────────────────────────────────────────

func TestRequestTypeConstants(t *testing.T) {
	if string(RequestTypeBug) != "bug" {
		t.Errorf("RequestTypeBug = %q", RequestTypeBug)
	}
	if string(RequestTypeFeature) != "feature" {
		t.Errorf("RequestTypeFeature = %q", RequestTypeFeature)
	}
}

func TestRequestStatusConstants(t *testing.T) {
	statuses := []RequestStatus{
		RequestStatusOpen, RequestStatusNeedsTriage,
		RequestStatusTriageAccepted, RequestStatusFeasibilityStudy,
		RequestStatusAIStuck, RequestStatusFixReady,
		RequestStatusFixComplete, RequestStatusUnableToFix,
		RequestStatusClosed,
	}
	for _, s := range statuses {
		if string(s) == "" {
			t.Error("empty status constant")
		}
	}
}

func TestFeatureRequestJSON(t *testing.T) {
	id := uuid.New()
	userID := uuid.New()
	now := time.Now()
	issueNum := 42
	fr := FeatureRequest{
		ID:                id,
		UserID:            userID,
		Title:             "Add GPU monitoring",
		Description:       "We need GPU monitoring on the dashboard",
		RequestType:       RequestTypeFeature,
		TargetRepo:        TargetRepoConsole,
		GitHubIssueNumber: &issueNum,
		Status:            RequestStatusOpen,
		CreatedAt:         now,
	}
	data, err := json.Marshal(fr)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded FeatureRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.Title != "Add GPU monitoring" {
		t.Errorf("Title = %q", decoded.Title)
	}
	if decoded.GitHubIssueNumber == nil || *decoded.GitHubIssueNumber != 42 {
		t.Errorf("GitHubIssueNumber = %v", decoded.GitHubIssueNumber)
	}
}

func TestNotificationTypeConstants(t *testing.T) {
	types := []NotificationType{
		NotificationTypeIssueCreated, NotificationTypeTriageAccepted,
		NotificationTypeFeasibilityStudy, NotificationTypeAIStuck,
		NotificationTypeFixReady, NotificationTypePreviewReady,
		NotificationTypeFixComplete, NotificationTypeUnableToFix,
		NotificationTypeClosed, NotificationTypeFeedbackReceived,
	}
	seen := make(map[string]bool)
	for _, nt := range types {
		s := string(nt)
		if s == "" {
			t.Error("empty notification type")
		}
		if seen[s] {
			t.Errorf("duplicate notification type: %q", s)
		}
		seen[s] = true
	}
}

func TestTargetRepoConstants(t *testing.T) {
	if string(TargetRepoConsole) != "console" {
		t.Errorf("TargetRepoConsole = %q", TargetRepoConsole)
	}
	if string(TargetRepoDocs) != "docs" {
		t.Errorf("TargetRepoDocs = %q", TargetRepoDocs)
	}
}

// ────────────────────────────────────────────────────────────────────
// user.go tests
// ────────────────────────────────────────────────────────────────────

// TestGetOnboardingQuestions_RBAC tests GetOnboardingQuestions from the RBAC
// package perspective. TestGetOnboardingQuestions in models_test.go provides
// the canonical coverage; this variant is kept for its distinct assertions.
func TestGetOnboardingQuestions_RBAC(t *testing.T) {
	questions := GetOnboardingQuestions()
	if len(questions) == 0 {
		t.Fatal("expected non-empty questions list")
	}
	keys := make(map[string]bool)
	for _, q := range questions {
		if q.Key == "" {
			t.Error("question has empty Key")
		}
		if q.Question == "" {
			t.Errorf("question %q has empty Question text", q.Key)
		}
		if len(q.Options) == 0 {
			t.Errorf("question %q has no options", q.Key)
		}
		if keys[q.Key] {
			t.Errorf("duplicate question key: %q", q.Key)
		}
		keys[q.Key] = true
	}
}

func TestOnboardingQuestionKeys(t *testing.T) {
	questions := GetOnboardingQuestions()
	expectedKeys := []string{"role", "focus_layer", "cluster_count", "daily_challenge", "gitops", "gpu_workloads"}
	qMap := make(map[string]bool)
	for _, q := range questions {
		qMap[q.Key] = true
	}
	for _, k := range expectedKeys {
		if !qMap[k] {
			t.Errorf("missing expected question key: %q", k)
		}
	}
}

// ────────────────────────────────────────────────────────────────────
// dashboard.go tests
// ────────────────────────────────────────────────────────────────────

func TestDashboardJSON(t *testing.T) {
	id := uuid.New()
	userID := uuid.New()
	now := time.Now()
	d := Dashboard{
		ID:        id,
		UserID:    userID,
		Name:      "Default",
		Layout:    json.RawMessage(`{"columns":3}`),
		IsDefault: true,
		CreatedAt: now,
	}
	data, err := json.Marshal(d)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded Dashboard
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.Name != "Default" {
		t.Errorf("Name = %q", decoded.Name)
	}
	if !decoded.IsDefault {
		t.Error("expected IsDefault = true")
	}
	var layout map[string]interface{}
	if err := json.Unmarshal(decoded.Layout, &layout); err != nil {
		t.Fatalf("Layout Unmarshal: %v", err)
	}
	if layout["columns"] != float64(3) {
		t.Errorf("Layout columns = %v", layout["columns"])
	}
}

func TestDashboardWithCards(t *testing.T) {
	dwc := DashboardWithCards{
		Dashboard: Dashboard{
			ID:   uuid.New(),
			Name: "Test",
		},
		Cards: []Card{},
	}
	data, err := json.Marshal(dwc)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded["name"] != "Test" {
		t.Errorf("name = %v", decoded["name"])
	}
	cards, ok := decoded["cards"].([]interface{})
	if !ok {
		t.Fatal("expected cards array")
	}
	if len(cards) != 0 {
		t.Errorf("expected empty cards, got %d", len(cards))
	}
}
