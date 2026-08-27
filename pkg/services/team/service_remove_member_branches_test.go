package team

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
)

// Closes previously-uncovered branches of RemoveMember and lifts the
// function from 70.6% -> 100%. Existing tests only covered the creator
// path, self-removal, and non-admin denial. The store-error and
// team-not-found arms, plus the "actor is admin" allow path, were all
// unreached — meaning a regression that swapped ErrNotFound for nil,
// or that dropped the admin allow-list from the permission check,
// would ship unnoticed.

// TestRemoveMember_GetTeamError covers the `if err != nil { return err }`
// arm after GetTeam. Previously untested — a regression that swallowed
// the store error would silently proceed to a nil-team dereference.
func TestRemoveMember_GetTeamError(t *testing.T) {
	sentinel := errors.New("store down")
	svc := New(&mockTeamStore{getErr: sentinel}, &mockUserStore{})

	err := svc.RemoveMember(context.Background(), uuid.New(), uuid.New(), uuid.New())
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error to be propagated, got %v", err)
	}
}

// TestRemoveMember_TeamNotFound covers the `if tm == nil` arm — the
// store returns (nil, nil) when the team simply doesn't exist. Must
// map to ErrNotFound, not a nil-deref later on tm.CreatedBy.
func TestRemoveMember_TeamNotFound(t *testing.T) {
	svc := New(&mockTeamStore{team: nil}, &mockUserStore{})

	err := svc.RemoveMember(context.Background(), uuid.New(), uuid.New(), uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

// TestRemoveMember_ByAdmin covers the "actor is a team admin (but not
// the creator and not the target)" allow path. This is the third arm
// of the permission check and was completely unexercised: neither the
// creator nor self-removal tests iterate the ListTeamMembers result,
// and TestRemoveMember_NoPermission short-circuits before finding an
// admin. A regression that dropped the admin lookup would flip the
// allow to a deny and this test would fail.
func TestRemoveMember_ByAdmin(t *testing.T) {
	creatorID := uuid.New()
	adminID := uuid.New()
	targetID := uuid.New()
	teamID := uuid.New()
	mock := &mockTeamStore{
		team: &models.Team{ID: teamID, CreatedBy: creatorID},
		members: []models.TeamMemberInfo{
			{UserID: uuid.New(), Role: models.TeamRoleMember}, // unrelated member
			{UserID: adminID, Role: models.TeamRoleAdmin},     // actor sits here
		},
	}
	svc := New(mock, &mockUserStore{})

	err := svc.RemoveMember(context.Background(), teamID, targetID, adminID)
	if err != nil {
		t.Fatalf("expected admin-authorized removal to succeed, got %v", err)
	}
	if mock.removedUserID != targetID {
		t.Fatalf("expected RemoveTeamMember called with %v, got %v", targetID, mock.removedUserID)
	}
}

// TestRemoveMember_ListMembersError covers the error return from
// ListTeamMembers inside the permission-check path. Only reached when
// actor is neither creator nor target — the existing NoPermission test
// short-circuits on a successful list, so this arm was uncovered.
func TestRemoveMember_ListMembersError(t *testing.T) {
	sentinel := errors.New("list members down")
	creatorID := uuid.New()
	mock := &mockTeamStore{
		team:           &models.Team{ID: uuid.New(), CreatedBy: creatorID},
		listMembersErr: sentinel,
	}
	svc := New(mock, &mockUserStore{})

	err := svc.RemoveMember(context.Background(), uuid.New(), uuid.New(), uuid.New())
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected list-members error to be propagated, got %v", err)
	}
}
