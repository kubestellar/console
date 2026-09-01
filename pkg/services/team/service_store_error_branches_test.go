package team

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
)

// TestCreate_CreateTeamStoreError covers Create()'s
// `return nil, err` at line 77 — CreateTeam fails at persistence.
func TestCreate_CreateTeamStoreError(t *testing.T) {
	sentinel := errors.New("db write failed")
	mock := &mockTeamStore{createErr: sentinel}
	svc := New(mock, &mockUserStore{})
	_, err := svc.Create(context.Background(), uuid.New(), models.CreateTeamRequest{Name: "team-a"})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
}

// TestGet_StoreError covers Get()'s `return nil, err` at line 87 — the
// GetTeamWithMembers call returns a non-nil error.
func TestGet_StoreError(t *testing.T) {
	sentinel := errors.New("db read failed")
	mock := &mockTeamStore{getWithMembersErr: sentinel}
	svc := New(mock, &mockUserStore{})
	_, err := svc.Get(context.Background(), uuid.New())
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
}

// TestDelete_GetTeamError covers Delete()'s `return err` at line 120 —
// the initial GetTeam call fails.
func TestDelete_GetTeamError(t *testing.T) {
	sentinel := errors.New("db read failed")
	mock := &mockTeamStore{getErr: sentinel}
	svc := New(mock, &mockUserStore{})
	err := svc.Delete(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
}

// TestDelete_ListMembersError covers Delete()'s inner `return err` at
// line 129 — the caller is NOT the creator, so ListTeamMembers is invoked
// and returns an error.
func TestDelete_ListMembersError(t *testing.T) {
	creator := uuid.New()
	actor := uuid.New()
	sentinel := errors.New("db read failed")
	mock := &mockTeamStore{
		team:           &models.Team{ID: uuid.New(), CreatedBy: creator},
		listMembersErr: sentinel,
	}
	svc := New(mock, &mockUserStore{})
	err := svc.Delete(context.Background(), uuid.New(), actor)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
}

// TestListMembers_GetTeamError covers ListMembers()'s `return nil, err`
// at line 183 — the initial GetTeam call fails before the member fetch.
func TestListMembers_GetTeamError(t *testing.T) {
	sentinel := errors.New("db read failed")
	mock := &mockTeamStore{getErr: sentinel}
	svc := New(mock, &mockUserStore{})
	_, err := svc.ListMembers(context.Background(), uuid.New())
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
}

// TestUpdate_UpdateTeamStoreError covers Update()'s `return nil, err` at
// line 251 — Get + admin check succeed but UpdateTeam persistence fails.
func TestUpdate_UpdateTeamStoreError(t *testing.T) {
	creator := uuid.New()
	sentinel := errors.New("db write failed")
	teamID := uuid.New()
	mock := &mockTeamStore{
		team:      &models.Team{ID: teamID, CreatedBy: creator, Name: "old"},
		updateErr: sentinel,
	}
	svc := New(mock, &mockUserStore{})
	newName := "new-name"
	_, err := svc.Update(context.Background(), teamID, creator, models.UpdateTeamRequest{Name: &newName})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
}
