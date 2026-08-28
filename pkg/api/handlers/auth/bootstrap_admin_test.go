package auth

import (
	"context"
	"errors"
	"testing"

	"github.com/kubestellar/console/pkg/test"
)

// shouldBootstrapAdmin (helpers.go:48) is the security gate that decides
// whether the first user to hit an admin endpoint on a fresh deployment
// gets silently promoted. go tool cover reports 44.4% on this function;
// the un-covered arms are the very ones the SECURITY FIX (#16485)
// header calls out.
//
// A regression that flipped any of these arms would either:
//   * silently re-enable the pre-#16485 privilege-escalation path when
//     BOOTSTRAP_ADMIN_ALLOWED is unset, or
//   * mis-report "bootstrap needed" against a deployment that already
//     has admins, letting a viewer be promoted after cluster wipe.
//
// These tests exercise every arm directly so any such regression fails
// CI before it ships.
func TestShouldBootstrapAdmin_NilStorePermits(t *testing.T) {
	ok, err := shouldBootstrapAdmin(context.Background(), nil)
	if err != nil {
		t.Fatalf("unexpected error with nil store: %v", err)
	}
	if !ok {
		t.Fatal("nil store must be treated as first-boot / bootstrap allowed")
	}
}

func TestShouldBootstrapAdmin_EnvVarUnsetRefuses(t *testing.T) {
	t.Setenv("BOOTSTRAP_ADMIN_ALLOWED", "")
	store := new(test.MockStore)
	// Store must not be consulted when the env-var gate is closed —
	// this is the whole point of the #16485 fix.
	ok, err := shouldBootstrapAdmin(context.Background(), store)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("bootstrap must be denied when BOOTSTRAP_ADMIN_ALLOWED is unset")
	}
	store.AssertNotCalled(t, "CountUsersByRole")
}

func TestShouldBootstrapAdmin_EnvVarNonTrueRefuses(t *testing.T) {
	// EqualFold("true") is the only accepted spelling — every other
	// value (including "1", "yes", " true ") must fall through as false.
	for _, v := range []string{"1", "yes", "TRUE-ISH", "false", "no"} {
		t.Run(v, func(t *testing.T) {
			t.Setenv("BOOTSTRAP_ADMIN_ALLOWED", v)
			store := new(test.MockStore)
			ok, err := shouldBootstrapAdmin(context.Background(), store)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ok {
				t.Fatalf("bootstrap must be denied for BOOTSTRAP_ADMIN_ALLOWED=%q", v)
			}
			store.AssertNotCalled(t, "CountUsersByRole")
		})
	}
}

func TestShouldBootstrapAdmin_EnvVarTrueButAdminExistsRefuses(t *testing.T) {
	t.Setenv("BOOTSTRAP_ADMIN_ALLOWED", "true")
	store := new(test.MockStore)
	// One admin already exists — bootstrap must be denied to prevent
	// silent promotion of the next requester (the #16485 vector).
	store.On("CountUsersByRole").Return(1, 0, 0, nil)
	ok, err := shouldBootstrapAdmin(context.Background(), store)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("bootstrap must be denied when at least one admin exists")
	}
}

func TestShouldBootstrapAdmin_EnvVarTrueAndZeroAdminsPermits(t *testing.T) {
	t.Setenv("BOOTSTRAP_ADMIN_ALLOWED", "true")
	store := new(test.MockStore)
	store.On("CountUsersByRole").Return(0, 5, 12, nil)
	ok, err := shouldBootstrapAdmin(context.Background(), store)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatal("bootstrap must be permitted on a fresh deployment (0 admins) with the gate open")
	}
}

func TestShouldBootstrapAdmin_EnvVarTrueMixedCasePermits(t *testing.T) {
	// EqualFold treats "True", "TRUE", " tRUE " (trimmed) as true.
	for _, v := range []string{"true", "True", "TRUE", "  true  ", "\ttrue\n"} {
		t.Run(v, func(t *testing.T) {
			t.Setenv("BOOTSTRAP_ADMIN_ALLOWED", v)
			store := new(test.MockStore)
			store.On("CountUsersByRole").Return(0, 0, 0, nil)
			ok, err := shouldBootstrapAdmin(context.Background(), store)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !ok {
				t.Fatalf("bootstrap must be permitted for BOOTSTRAP_ADMIN_ALLOWED=%q with zero admins", v)
			}
		})
	}
}

func TestShouldBootstrapAdmin_EnvVarTrueStoreErrorPropagates(t *testing.T) {
	t.Setenv("BOOTSTRAP_ADMIN_ALLOWED", "true")
	store := new(test.MockStore)
	wantErr := errors.New("stub: db unavailable")
	store.On("CountUsersByRole").Return(0, 0, 0, wantErr)
	ok, err := shouldBootstrapAdmin(context.Background(), store)
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected wrapped store error, got %v", err)
	}
	if ok {
		t.Fatal("bootstrap must not be permitted when the admin count cannot be read")
	}
}
