// Package user provides a service layer that encapsulates business logic for
// user account operations. Handlers delegate to this service instead of
// coupling directly to the store, making the domain logic independently
// testable and reusable across transport layers (HTTP, gRPC, CLI).
package user

import (
	"context"
	"errors"
	"net/mail"
	"regexp"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// emailDomainRegexp requires a domain with at least one dot and a TLD of 2+ chars.
var emailDomainRegexp = regexp.MustCompile(`^[^@]+@[^@]+\.[a-zA-Z]{2,}$`)

// ErrNotFound is returned when a requested user does not exist.
var ErrNotFound = errors.New("user not found")

// ErrInvalidEmail is returned when an email address fails validation.
var ErrInvalidEmail = errors.New("invalid email format")

// UpdateParams holds the mutable fields a caller may change on a user profile.
type UpdateParams struct {
	Email   string
	SlackID string
}

// Service defines the contract for user business operations.
// Consumers depend on this interface rather than a concrete implementation,
// enabling straightforward mocking in handler tests.
type Service interface {
	// GetByID retrieves a user by their unique identifier.
	GetByID(ctx context.Context, id uuid.UUID) (*models.User, error)

	// UpdateProfile applies validated profile changes to the given user.
	UpdateProfile(ctx context.Context, id uuid.UUID, params UpdateParams) (*models.User, error)
}

// service is the default implementation backed by a UserStore.
type service struct {
	users store.UserStore
}

// New creates a Service backed by the provided UserStore.
func New(users store.UserStore) Service {
	return &service{users: users}
}

// GetByID retrieves a user by ID, returning ErrNotFound if absent.
func (s *service) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	user, err := s.users.GetUser(ctx, id)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrNotFound
	}
	return user, nil
}

// UpdateProfile validates and persists profile changes.
func (s *service) UpdateProfile(ctx context.Context, id uuid.UUID, params UpdateParams) (*models.User, error) {
	user, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if params.Email != "" {
		if err := validateEmail(params.Email); err != nil {
			return nil, err
		}
		user.Email = params.Email
	}
	if params.SlackID != "" {
		user.SlackID = params.SlackID
	}

	if err := s.users.UpdateUser(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

// validateEmail checks RFC 5322 structure and requires a real domain with TLD.
func validateEmail(email string) error {
	if _, err := mail.ParseAddress(email); err != nil {
		return ErrInvalidEmail
	}
	if !emailDomainRegexp.MatchString(email) {
		return ErrInvalidEmail
	}
	return nil
}
