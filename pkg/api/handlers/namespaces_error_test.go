package handlers

import (
	"context"
	"errors"
	"testing"

	"github.com/gofiber/fiber/v2"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// TestNamespaceListError covers the switch in namespaceListError, mapping
// upstream Kubernetes API errors into HTTP status codes.  The existing
// ListNamespaces tests only exercise the happy path — coverage was 50%
// (only the default arm ran).
func TestNamespaceListError(t *testing.T) {
	gr := schema.GroupResource{Group: "", Resource: "namespaces"}

	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantMsg    string
	}{
		{
			name:       "forbidden maps to 403",
			err:        apierrors.NewForbidden(gr, "ns", errors.New("nope")),
			wantStatus: fiber.StatusForbidden,
			wantMsg:    "forbidden",
		},
		{
			name:       "unauthorized also maps to 403",
			err:        apierrors.NewUnauthorized("no auth"),
			wantStatus: fiber.StatusForbidden,
			wantMsg:    "forbidden",
		},
		{
			name:       "service unavailable maps to 503",
			err:        apierrors.NewServiceUnavailable("cluster gone"),
			wantStatus: fiber.StatusServiceUnavailable,
			wantMsg:    "cluster temporarily unavailable",
		},
		{
			name:       "timeout maps to 503",
			err:        apierrors.NewTimeoutError("timed out", 1),
			wantStatus: fiber.StatusServiceUnavailable,
			wantMsg:    "cluster temporarily unavailable",
		},
		{
			name:       "server timeout maps to 503",
			err:        apierrors.NewServerTimeout(gr, "list", 1),
			wantStatus: fiber.StatusServiceUnavailable,
			wantMsg:    "cluster temporarily unavailable",
		},
		{
			name:       "context deadline exceeded maps to 503",
			err:        context.DeadlineExceeded,
			wantStatus: fiber.StatusServiceUnavailable,
			wantMsg:    "cluster temporarily unavailable",
		},
		{
			name:       "wrapped context deadline exceeded maps to 503",
			err:        wrap(context.DeadlineExceeded),
			wantStatus: fiber.StatusServiceUnavailable,
			wantMsg:    "cluster temporarily unavailable",
		},
		{
			name:       "generic error maps to 500",
			err:        errors.New("boom"),
			wantStatus: fiber.StatusInternalServerError,
			wantMsg:    "internal server error",
		},
		{
			name: "NotFound maps to 500 (default arm)",
			err: apierrors.NewNotFound(gr, "missing"),
			wantStatus: fiber.StatusInternalServerError,
			wantMsg:    "internal server error",
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			out := namespaceListError(tc.err)

			fiberErr, ok := out.(*fiber.Error)
			if !ok {
				t.Fatalf("expected *fiber.Error, got %T (%v)", out, out)
			}
			if fiberErr.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d", fiberErr.Code, tc.wantStatus)
			}
			if fiberErr.Message != tc.wantMsg {
				t.Errorf("msg = %q, want %q", fiberErr.Message, tc.wantMsg)
			}
		})
	}
}

// wrap emulates the common pattern of returning fmt.Errorf("foo: %w", err)
// so we cover the errors.Is arm rather than just direct equality.
func wrap(err error) error {
	return &wrappedErr{err: err}
}

type wrappedErr struct{ err error }

func (w *wrappedErr) Error() string { return "wrapped: " + w.err.Error() }
func (w *wrappedErr) Unwrap() error { return w.err }

// Ensure the fake StatusError types we construct implement metav1.StatusReason
// as expected by the apierrors.Is* predicates. This tiny compile-time check is
// cheap insurance that the k8s.io error constructors haven't shifted schema.
var _ *metav1.Status = &metav1.Status{}
