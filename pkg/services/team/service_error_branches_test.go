package team

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
)

// Closes the two shared error-return branches inside AddMember, Update,
// and UpdateMemberRole:
//
//   1. GetTeam returned an error (store propagation).
//   2. isTeamAdmin's ListTeamMembers returned an error (permission-check
//      store propagation).
//
// Existing service_test.go tests only cover NotFound (team==nil), the
// creator/admin allow paths, and the NoPermission arm (list succeeds
// but actor is not admin). That leaves the two store-error arms of each
// of the three functions unreached — six total branches. Symptoms of
// a regression that dropped either propagation:
//   - GetTeam err swallowed  -> nil-team dereference on `team.CreatedBy`
//     inside isTeamAdmin, panicking the request.
//   - ListTeamMembers err swallowed -> silent deny even when the actor
//     really is an admin, breaking legitimate team management.
//
// The pattern mirrors service_remove_member_branches_test.go (already
// merged as the equivalent for RemoveMember) and lifts each of the three
// functions to ~100% branch coverage.

// -- AddMember ---------------------------------------------------------

func TestAddMember_GetTeamError(t *testing.T) {
	sentinel := errors.New("store down")
	svc := New(&mockTeamStore{getErr: sentinel}, &mockUserStore{})

	err := svc.AddMember(context.Background(), uuid.New(), uuid.New(), uuid.New(), models.TeamRoleMember)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error to be propagated, got %v", err)
	}
}

func TestAddMember_ListMembersError(t *testing.T) {
	sentinel := errors.New("list members down")
	creatorID := uuid.New()
	mock := &mockTeamStore{
		// actor is neither creator nor a listed admin — permission
		// check enters isTeamAdmin, which then hits the list error.
		team:           &models.Team{ID: uuid.New(), CreatedBy: creatorID},
		listMembersErr: sentinel,
	}
	svc := New(mock, &mockUserStore{})

	err := svc.AddMember(context.Background(), uuid.New(), uuid.New(), uuid.New(), models.TeamRoleMember)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected list-members error to be propagated, got %v", err)
	}
	// AddTeamMember must NOT have been called on the store.
	if mock.addedUserID != (uuid.UUID{}) {
		t.Fatalf("expected AddTeamMember not to be called after permission-check failure")
	}
}

// -- Update ------------------------------------------------------------

func TestUpdate_GetTeamError(t *testing.T) {
	sentinel := errors.New("store down")
	svc := New(&mockTeamStore{getErr: sentinel}, &mockUserStore{})

	newName := "new name"
	_, err := svc.Update(context.Background(), uuid.New(), uuid.New(), models.UpdateTeamRequest{Name: &newName})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error to be propagated, got %v", err)
	}
}

func TestUpdate_ListMembersError(t *testing.T) {
	sentinel := errors.New("list members down")
	creatorID := uuid.New()
	mock := &mockTeamStore{
		team:           &models.Team{ID: uuid.New(), CreatedBy: creatorID},
		listMembersErr: sentinel,
	}
	svc := New(mock, &mockUserStore{})

	newName := "new name"
	got, err := svc.Update(context.Background(), uuid.New(), uuid.New(), models.UpdateTeamRequest{Name: &newName})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected list-members error to be propagated, got %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil team on permission-check failure, got %+v", got)
	}
	// UpdateTeam must NOT have been called on the store.
	if mock.updatedTeam != nil {
		t.Fatalf("expected UpdateTeam not to be called after permission-check failure")
	}
}

// -- UpdateMemberRole --------------------------------------------------

func TestUpdateMemberRole_GetTeamError(t *testing.T) {
	sentinel := errors.New("store down")
	svc := New(&mockTeamStore{getErr: sentinel}, &mockUserStore{})

	err := svc.UpdateMemberRole(context.Background(), uuid.New(), uuid.New(), uuid.New(), models.TeamRoleAdmin)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error to be propagated, got %v", err)
	}
}

func TestUpdateMemberRole_ListMembersError(t *testing.T) {
	sentinel := errors.New("list members down")
	creatorID := uuid.New()
	mock := &mockTeamStore{
		team:           &models.Team{ID: uuid.New(), CreatedBy: creatorID},
		listMembersErr: sentinel,
	}
	svc := New(mock, &mockUserStore{})

	err := svc.UpdateMemberRole(context.Background(), uuid.New(), uuid.New(), uuid.New(), models.TeamRoleAdmin)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected list-members error to be propagated, got %v", err)
	}
	// UpdateTeamMemberRole must NOT have been called on the store.
	if mock.updatedMemberUserID != (uuid.UUID{}) {
		t.Fatalf("expected UpdateTeamMemberRole not to be called after permission-check failure")
	}
}
