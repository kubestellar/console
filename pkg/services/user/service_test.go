package user

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
)

// mockUserStore is a minimal mock that satisfies store.UserStore for the
// methods used by Service. Unused interface methods panic if called.
type mockUserStore struct {
	user      *models.User
	getErr    error
	updateErr error
	updated   *models.User
}

func (m *mockUserStore) GetUser(_ context.Context, _ uuid.UUID) (*models.User, error) {
	return m.user, m.getErr
}

func (m *mockUserStore) UpdateUser(_ context.Context, u *models.User) error {
	m.updated = u
	return m.updateErr
}

// Unused interface methods — included to satisfy store.UserStore.
func (m *mockUserStore) GetUserByGitHubID(context.Context, string) (*models.User, error) {
	panic("not implemented")
}
func (m *mockUserStore) GetUserByGitHubLogin(context.Context, string) (*models.User, error) {
	panic("not implemented")
}
func (m *mockUserStore) CreateUser(context.Context, *models.User) error  { panic("not implemented") }
func (m *mockUserStore) UpdateLastLogin(context.Context, uuid.UUID) error { panic("not implemented") }
func (m *mockUserStore) ListUsers(context.Context, int, int) ([]models.User, error) {
	panic("not implemented")
}
func (m *mockUserStore) DeleteUser(context.Context, uuid.UUID) error { panic("not implemented") }
func (m *mockUserStore) UpdateUserRole(context.Context, uuid.UUID, string) error {
	panic("not implemented")
}
func (m *mockUserStore) CountUsersByRole(context.Context) (int, int, int, error) {
	panic("not implemented")
}

func TestGetByID_NotFound(t *testing.T) {
	svc := New(&mockUserStore{user: nil})
	_, err := svc.GetByID(context.Background(), uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestGetByID_Success(t *testing.T) {
	id := uuid.New()
	want := &models.User{ID: id, GitHubLogin: "testuser"}
	svc := New(&mockUserStore{user: want})
	got, err := svc.GetByID(context.Background(), id)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != want.ID {
		t.Fatalf("got ID %v, want %v", got.ID, want.ID)
	}
}

func TestUpdateProfile_InvalidEmail(t *testing.T) {
	id := uuid.New()
	svc := New(&mockUserStore{user: &models.User{ID: id}})
	_, err := svc.UpdateProfile(context.Background(), id, UpdateParams{Email: "bad"})
	if !errors.Is(err, ErrInvalidEmail) {
		t.Fatalf("expected ErrInvalidEmail, got %v", err)
	}
}

func TestUpdateProfile_Success(t *testing.T) {
	id := uuid.New()
	mock := &mockUserStore{user: &models.User{ID: id, GitHubLogin: "u"}}
	svc := New(mock)
	got, err := svc.UpdateProfile(context.Background(), id, UpdateParams{
		Email:   "hello@example.com",
		SlackID: "U123",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Email != "hello@example.com" {
		t.Fatalf("email not updated")
	}
	if mock.updated == nil {
		t.Fatal("store.UpdateUser was not called")
	}
}
