package user

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
)

// TestGetByID_StoreError covers the `if err != nil` branch in GetByID
// where the underlying UserStore returns a non-nil error.
func TestGetByID_StoreError(t *testing.T) {
	sentinel := errors.New("db down")
	svc := New(&mockUserStore{getErr: sentinel})
	_, err := svc.GetByID(context.Background(), uuid.New())
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error to propagate, got %v", err)
	}
}

// TestUpdateProfile_GetByIDError covers the `if err != nil` early-return in
// UpdateProfile after the internal GetByID call fails.
func TestUpdateProfile_GetByIDError(t *testing.T) {
	sentinel := errors.New("db down")
	svc := New(&mockUserStore{getErr: sentinel})
	_, err := svc.UpdateProfile(context.Background(), uuid.New(), UpdateParams{Email: "hello@example.com"})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
}

// TestUpdateProfile_UpdateUserError covers the `if err := s.users.UpdateUser(...)`
// error branch — GetByID succeeds and validation passes, but persistence fails.
func TestUpdateProfile_UpdateUserError(t *testing.T) {
	id := uuid.New()
	sentinel := errors.New("write conflict")
	mock := &mockUserStore{
		user:      &models.User{ID: id, GitHubLogin: "u"},
		updateErr: sentinel,
	}
	svc := New(mock)
	_, err := svc.UpdateProfile(context.Background(), id, UpdateParams{
		Email:   "hello@example.com",
		SlackID: "U123",
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
	if mock.updated == nil {
		t.Fatal("expected UpdateUser to be attempted before the error")
	}
}

// TestUpdateProfile_NoOpParams verifies that when neither Email nor SlackID is
// set, the user record is passed through UpdateUser unchanged (both `if
// params.X != ""` branches are false).
func TestUpdateProfile_NoOpParams(t *testing.T) {
	id := uuid.New()
	orig := &models.User{ID: id, GitHubLogin: "u", Email: "old@example.com", SlackID: "OLD"}
	mock := &mockUserStore{user: orig}
	svc := New(mock)
	got, err := svc.UpdateProfile(context.Background(), id, UpdateParams{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Email != "old@example.com" || got.SlackID != "OLD" {
		t.Fatalf("no-op update mutated fields: %+v", got)
	}
	if mock.updated == nil {
		t.Fatal("expected UpdateUser to be called even with no field changes")
	}
}
