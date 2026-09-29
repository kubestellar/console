package stellar

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/store"
)

// readListQueryParams runs a real fiber round-trip so readListLimit and
// readListOffset are exercised via *fiber.Ctx, matching how the Stellar list
// endpoints call them.
func readListQueryParams(t *testing.T, query string) (int, int) {
	t.Helper()

	app := fiber.New()
	var gotLimit, gotOffset int
	app.Get("/probe", func(c *fiber.Ctx) error {
		gotLimit = readListLimit(c)
		gotOffset = readListOffset(c)
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest("GET", "/probe?"+query, nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test returned error: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("unexpected status %d for query %q", resp.StatusCode, query)
	}
	return gotLimit, gotOffset
}

// TestReadListLimit_Defaults_And_Clamping covers the empty, valid, negative,
// non-numeric, whitespace-padded, and over-cap branches of readListLimit — the
// same helper every Stellar list endpoint uses to bound page size.
func TestReadListLimit_Defaults_And_Clamping(t *testing.T) {
	cases := []struct {
		name  string
		query string
		want  int
	}{
		{"absent falls back to default", "", stellarDefaultListLimit},
		{"empty string falls back to default", "limit=", stellarDefaultListLimit},
		{"whitespace-only falls back to default", "limit=%20%20", stellarDefaultListLimit},
		{"non-numeric falls back to default", "limit=abc", stellarDefaultListLimit},
		{"zero falls back to default", "limit=0", stellarDefaultListLimit},
		{"negative falls back to default", "limit=-5", stellarDefaultListLimit},
		{"valid below cap is preserved", "limit=25", 25},
		{"whitespace around numeric is trimmed", "limit=%20%2010%20%20", 10},
		{"exactly at cap passes through", "limit=200", stellarMaxListLimit},
		{"above cap is clamped", "limit=99999", stellarMaxListLimit},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, _ := readListQueryParams(t, tc.query)
			if got != tc.want {
				t.Fatalf("readListLimit(%q) = %d, want %d", tc.query, got, tc.want)
			}
		})
	}
}

// TestReadListOffset_ParsesAndRejects covers absent, malformed, zero, negative
// and positive offsets. Negative and non-numeric values must fall back to 0
// so upstream pagination never sends a negative LIMIT/OFFSET to SQLite.
func TestReadListOffset_ParsesAndRejects(t *testing.T) {
	cases := []struct {
		name  string
		query string
		want  int
	}{
		{"absent is zero", "", 0},
		{"empty string is zero", "offset=", 0},
		{"whitespace is zero", "offset=%20", 0},
		{"non-numeric is zero", "offset=oops", 0},
		{"zero is zero", "offset=0", 0},
		{"negative is zero", "offset=-1", 0},
		{"positive passes through", "offset=42", 42},
		{"whitespace-padded numeric passes through", "offset=%20%207%20", 7},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, got := readListQueryParams(t, tc.query)
			if got != tc.want {
				t.Fatalf("readListOffset(%q) = %d, want %d", tc.query, got, tc.want)
			}
		})
	}
}

// TestShouldDeliverStellarSSEEvent_AudienceGates covers the SSE fan-out gate.
// A miscoded branch here would cross-deliver another user's activity/memory
// events, so every branch — admin-only, system, empty audience, matching
// user, mismatched user, admin-eavesdrop — is exercised explicitly.
func TestShouldDeliverStellarSSEEvent_AudienceGates(t *testing.T) {
	regular := stellarSSEClient{userID: "user-1"}
	other := stellarSSEClient{userID: "user-2"}
	admin := stellarSSEClient{userID: "admin-1", isAdmin: true}

	cases := []struct {
		name   string
		client stellarSSEClient
		event  SSEEvent
		want   bool
	}{
		{"admin-only event: admin delivered", admin, SSEEvent{AdminOnly: true, UserID: "user-1"}, true},
		{"admin-only event: regular filtered out", regular, SSEEvent{AdminOnly: true, UserID: "user-1"}, false},
		{"system event: admin delivered", admin, SSEEvent{UserID: stellarSystemUserID}, true},
		{"system event: regular filtered out", regular, SSEEvent{UserID: stellarSystemUserID}, false},
		{"empty audience: admin delivered", admin, SSEEvent{}, true},
		{"empty audience: regular filtered out", regular, SSEEvent{}, false},
		{"scoped event: matching user delivered", regular, SSEEvent{UserID: "user-1"}, true},
		{"scoped event: non-matching user filtered out", other, SSEEvent{UserID: "user-1"}, false},
		{"scoped event: admin still delivered", admin, SSEEvent{UserID: "user-1"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldDeliverStellarSSEEvent(tc.client, tc.event); got != tc.want {
				t.Fatalf("shouldDeliverStellarSSEEvent = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestScoreAndSortMemories_ImportanceAndRecency verifies that memories are
// ordered by score desc (importance*10 minus hours since creation) and, on
// ties, by most-recent CreatedAt first. Also guards against mutation of the
// caller's slice, since scoreAndSortMemories is documented to return a copy.
func TestScoreAndSortMemories_ImportanceAndRecency(t *testing.T) {
	now := time.Now()
	input := []store.StellarMemoryEntry{
		{ID: "low-old", Importance: 1, CreatedAt: now.Add(-48 * time.Hour)},
		{ID: "high-recent", Importance: 5, CreatedAt: now.Add(-1 * time.Hour)},
		{ID: "high-old", Importance: 5, CreatedAt: now.Add(-24 * time.Hour)},
		{ID: "med-recent", Importance: 3, CreatedAt: now.Add(-2 * time.Hour)},
	}
	original := append([]store.StellarMemoryEntry(nil), input...)

	sorted := scoreAndSortMemories(input)

	if len(sorted) != len(input) {
		t.Fatalf("length changed: got %d want %d", len(sorted), len(input))
	}
	if sorted[0].ID != "high-recent" {
		t.Errorf("expected high-recent first, got %q", sorted[0].ID)
	}
	// Verify non-increasing score, and CreatedAt-desc tiebreak.
	for i := 1; i < len(sorted); i++ {
		prev, cur := memoryScore(sorted[i-1]), memoryScore(sorted[i])
		if prev < cur {
			t.Errorf("scores not descending at %d: prev=%f cur=%f", i, prev, cur)
		}
		if prev == cur && sorted[i-1].CreatedAt.Before(sorted[i].CreatedAt) {
			t.Errorf("tiebreak not most-recent-first at %d", i)
		}
	}
	// Input slice must not be reordered.
	for i, m := range input {
		if m.ID != original[i].ID {
			t.Fatalf("input mutated at %d: %q vs %q", i, m.ID, original[i].ID)
		}
	}
}

// TestScoreAndSortMemories_EmptyIsSafe ensures an empty input returns an
// empty (non-nil) slice — callers append into the result without a nil check.
func TestScoreAndSortMemories_EmptyIsSafe(t *testing.T) {
	got := scoreAndSortMemories(nil)
	if got == nil {
		t.Fatal("expected non-nil empty slice, got nil")
	}
	if len(got) != 0 {
		t.Fatalf("expected empty slice, got %d entries", len(got))
	}
}

// TestResolveSSEEventAudience_FillsAndLocksDown verifies each branch of
// resolveSSEEventAudience: TargetUserID promotes to UserID; explicit
// AdminOnly/UserID passes through untouched; data-derived audiences populate
// UserID+AdminOnly; and an unresolvable event is locked down as admin-only
// rather than fanning out to every SSE client.
func TestResolveSSEEventAudience_FillsAndLocksDown(t *testing.T) {
	h := &Handler{}

	t.Run("target user promotes to UserID", func(t *testing.T) {
		got := h.resolveSSEEventAudience(SSEEvent{TargetUserID: "user-7"})
		if got.UserID != "user-7" || got.TargetUserID != "user-7" {
			t.Fatalf("got %+v", got)
		}
		if got.AdminOnly {
			t.Fatal("AdminOnly must not be set on a user-scoped event")
		}
	})

	t.Run("explicit UserID passes through", func(t *testing.T) {
		got := h.resolveSSEEventAudience(SSEEvent{UserID: "user-9"})
		if got.UserID != "user-9" || got.AdminOnly {
			t.Fatalf("got %+v", got)
		}
	})

	t.Run("explicit AdminOnly passes through", func(t *testing.T) {
		got := h.resolveSSEEventAudience(SSEEvent{AdminOnly: true})
		if !got.AdminOnly || got.UserID != "" {
			t.Fatalf("got %+v", got)
		}
	})

	t.Run("data-derived audience is populated", func(t *testing.T) {
		got := h.resolveSSEEventAudience(SSEEvent{
			Type: "notification",
			Data: store.StellarNotification{UserID: "user-11"},
		})
		if got.UserID != "user-11" || got.AdminOnly {
			t.Fatalf("got %+v", got)
		}
	})

	t.Run("system data locks event as admin-only", func(t *testing.T) {
		got := h.resolveSSEEventAudience(SSEEvent{
			Type: "activity",
			Data: store.StellarActivity{UserID: stellarSystemUserID},
		})
		if !got.AdminOnly {
			t.Fatalf("system event must be admin-only, got %+v", got)
		}
	})

	t.Run("unresolvable event locks down as admin-only", func(t *testing.T) {
		got := h.resolveSSEEventAudience(SSEEvent{Type: "cluster.update", Data: 42})
		if !got.AdminOnly {
			t.Fatalf("unresolvable event must default to admin-only, got %+v", got)
		}
		if got.UserID != "" {
			t.Fatalf("unresolvable event must not fabricate a UserID, got %q", got.UserID)
		}
	})
}
