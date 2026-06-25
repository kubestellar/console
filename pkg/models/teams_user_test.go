package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

// ────────────────────────────────────────────────────────────────────
// teams.go tests
// ────────────────────────────────────────────────────────────────────

func TestTeamRoleConstants(t *testing.T) {
	if string(TeamRoleAdmin) != "admin" {
		t.Errorf("TeamRoleAdmin = %q, want \"admin\"", TeamRoleAdmin)
	}
	if string(TeamRoleMember) != "member" {
		t.Errorf("TeamRoleMember = %q, want \"member\"", TeamRoleMember)
	}
}

func TestTeamJSONRoundTrip(t *testing.T) {
	id := uuid.New()
	now := time.Now().Truncate(time.Second)
	team := Team{
		ID:          id,
		Name:        "platform-eng",
		Description: "Platform engineering team",
		CreatedBy:   uuid.New(),
		MemberCount: 5,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	data, err := json.Marshal(team)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}

	var decoded Team
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.Name != "platform-eng" {
		t.Errorf("Name = %q", decoded.Name)
	}
	if decoded.MemberCount != 5 {
		t.Errorf("MemberCount = %d, want 5", decoded.MemberCount)
	}
	if decoded.ID != id {
		t.Errorf("ID mismatch")
	}
}

func TestTeamOmitsEmptyDescription(t *testing.T) {
	team := Team{Name: "ops"}
	data, err := json.Marshal(team)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if _, ok := m["description"]; ok {
		t.Error("expected description to be omitted when empty")
	}
}

func TestTeamMembershipJSONRoundTrip(t *testing.T) {
	tm := TeamMembership{
		ID:        uuid.New(),
		TeamID:    uuid.New(),
		UserID:    uuid.New(),
		Role:      TeamRoleAdmin,
		CreatedAt: time.Now().Truncate(time.Second),
	}

	data, err := json.Marshal(tm)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded TeamMembership
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.Role != TeamRoleAdmin {
		t.Errorf("Role = %q, want \"admin\"", decoded.Role)
	}
}

func TestCreateTeamRequestJSON(t *testing.T) {
	req := CreateTeamRequest{
		Name:      "sre",
		MemberIDs: []string{"user-1", "user-2"},
	}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded CreateTeamRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.Name != "sre" {
		t.Errorf("Name = %q", decoded.Name)
	}
	if len(decoded.MemberIDs) != 2 {
		t.Errorf("MemberIDs len = %d, want 2", len(decoded.MemberIDs))
	}
}

func TestCreateTeamRequestOmitsEmpty(t *testing.T) {
	req := CreateTeamRequest{Name: "ops"}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if _, ok := m["description"]; ok {
		t.Error("expected description to be omitted")
	}
	if _, ok := m["memberIds"]; ok {
		t.Error("expected memberIds to be omitted when empty")
	}
}

func TestUpdateTeamRequestJSON(t *testing.T) {
	name := "new-name"
	desc := "updated"
	req := UpdateTeamRequest{Name: &name, Description: &desc}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded UpdateTeamRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.Name == nil || *decoded.Name != "new-name" {
		t.Errorf("Name = %v", decoded.Name)
	}
}

func TestUpdateTeamRequestNilFields(t *testing.T) {
	req := UpdateTeamRequest{}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if _, ok := m["name"]; ok {
		t.Error("expected name to be omitted when nil")
	}
	if _, ok := m["description"]; ok {
		t.Error("expected description to be omitted when nil")
	}
}

func TestAddTeamMemberRequestJSON(t *testing.T) {
	req := AddTeamMemberRequest{UserID: "usr-123", Role: TeamRoleMember}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded AddTeamMemberRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.UserID != "usr-123" {
		t.Errorf("UserID = %q", decoded.UserID)
	}
	if decoded.Role != TeamRoleMember {
		t.Errorf("Role = %q", decoded.Role)
	}
}

func TestTeamWithMembersJSON(t *testing.T) {
	twm := TeamWithMembers{
		Team: Team{ID: uuid.New(), Name: "devs"},
		Members: []TeamMemberInfo{
			{UserID: uuid.New(), GitHubLogin: "alice", Role: TeamRoleAdmin},
			{UserID: uuid.New(), GitHubLogin: "bob", Role: TeamRoleMember, Email: "bob@example.com"},
		},
	}
	data, err := json.Marshal(twm)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded TeamWithMembers
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.Name != "devs" {
		t.Errorf("Name = %q", decoded.Name)
	}
	if len(decoded.Members) != 2 {
		t.Fatalf("Members len = %d, want 2", len(decoded.Members))
	}
	if decoded.Members[0].GitHubLogin != "alice" {
		t.Errorf("Members[0].GitHubLogin = %q", decoded.Members[0].GitHubLogin)
	}
}

func TestTeamMemberInfoOmitsOptionalFields(t *testing.T) {
	info := TeamMemberInfo{UserID: uuid.New(), GitHubLogin: "carol", Role: TeamRoleMember}
	data, err := json.Marshal(info)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if _, ok := m["avatarUrl"]; ok {
		t.Error("expected avatarUrl to be omitted when empty")
	}
	if _, ok := m["email"]; ok {
		t.Error("expected email to be omitted when empty")
	}
}

// ────────────────────────────────────────────────────────────────────
// user.go tests (supplement existing coverage)
// ────────────────────────────────────────────────────────────────────

func TestUserJSONRoundTrip(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	user := User{
		ID:          uuid.New(),
		GitHubID:    "12345",
		GitHubLogin: "devuser",
		Email:       "dev@example.com",
		Role:        UserRoleAdmin,
		Onboarded:   true,
		CreatedAt:   now,
		LastLogin:   &now,
	}
	data, err := json.Marshal(user)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded User
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.GitHubLogin != "devuser" {
		t.Errorf("GitHubLogin = %q", decoded.GitHubLogin)
	}
	if !decoded.Onboarded {
		t.Error("expected Onboarded = true")
	}
	if decoded.LastLogin == nil {
		t.Error("expected LastLogin to be non-nil")
	}
}

func TestUserOmitsOptionalFields(t *testing.T) {
	user := User{GitHubID: "1", GitHubLogin: "u"}
	data, err := json.Marshal(user)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if _, ok := m["email"]; ok {
		t.Error("expected email to be omitted when empty")
	}
	if _, ok := m["slack_id"]; ok {
		t.Error("expected slack_id to be omitted when empty")
	}
	if _, ok := m["last_login"]; ok {
		t.Error("expected last_login to be omitted when nil")
	}
}

func TestOnboardingResponseJSON(t *testing.T) {
	or := OnboardingResponse{
		ID:          uuid.New(),
		UserID:      uuid.New(),
		QuestionKey: "role",
		Answer:      "SRE",
		CreatedAt:   time.Now().Truncate(time.Second),
	}
	data, err := json.Marshal(or)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded OnboardingResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if decoded.QuestionKey != "role" {
		t.Errorf("QuestionKey = %q", decoded.QuestionKey)
	}
	if decoded.Answer != "SRE" {
		t.Errorf("Answer = %q", decoded.Answer)
	}
}
