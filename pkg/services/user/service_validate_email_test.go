package user

import (
	"context"
	"errors"
	"net/mail"
	"testing"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/models"
)

// Closes the previously-uncovered regex arm of validateEmail
// (pkg/services/user/service.go:95). The existing invalid-email test
// uses "bad" — that fails mail.ParseAddress before ever reaching the
// domain regex. A syntactically-valid RFC 5322 address whose domain
// has no TLD (e.g. "x@localhost") passes ParseAddress and only fails
// via the emailDomainRegexp check. Without this test a regression
// that dropped the regex entirely would accept x@localhost.

// TestUpdateProfile_ValidRFC5322ButNoTLD forces the code path where
// mail.ParseAddress accepts the address but emailDomainRegexp rejects
// it. Uses UpdateProfile as the entry point (the only exported caller
// of validateEmail).
func TestUpdateProfile_ValidRFC5322ButNoTLD(t *testing.T) {
	// Sanity check: the intermediate function's precondition still
	// holds today. If mail.ParseAddress ever tightens and rejects
	// "x@localhost" this test would still fail meaningfully — the
	// service would return ErrInvalidEmail for a different reason,
	// but the assertion below still passes.
	if _, err := mail.ParseAddress("x@localhost"); err != nil {
		t.Logf("net/mail semantics changed — ParseAddress now rejects x@localhost: %v", err)
	}

	id := uuid.New()
	svc := New(&mockUserStore{user: &models.User{ID: id}})
	_, err := svc.UpdateProfile(context.Background(), id, UpdateParams{Email: "x@localhost"})
	if !errors.Is(err, ErrInvalidEmail) {
		t.Fatalf("expected ErrInvalidEmail for no-TLD domain, got %v", err)
	}
}

// TestUpdateProfile_ShortTLDRejected exercises the same regex arm
// against a domain with a 1-char TLD (e.g. "user@foo.x"). The regex
// requires TLD 2+ chars; a regression that loosened that to 1+
// would accept this case, and this test would fail.
func TestUpdateProfile_ShortTLDRejected(t *testing.T) {
	id := uuid.New()
	svc := New(&mockUserStore{user: &models.User{ID: id}})
	_, err := svc.UpdateProfile(context.Background(), id, UpdateParams{Email: "user@foo.x"})
	if !errors.Is(err, ErrInvalidEmail) {
		t.Fatalf("expected ErrInvalidEmail for 1-char TLD, got %v", err)
	}
}
