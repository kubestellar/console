package store

import (
	"database/sql"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/models"
)

// TestMoveCardWithLimit_NonexistentCardReturnsErrNoRows pins the branch in
// sqlite_dashboards.go:424 that distinguishes "card doesn't exist" from
// "limit reached". Existing tests in sqlite_dashboards_extra_test.go cover
// the happy-path move and the limit-reached-when-card-exists arm, but never
// exercise the terminal `return sql.ErrNoRows` for a missing card.
//
// This is the safety guard that lets callers up the stack (HTTP handlers)
// return 404 vs 409 correctly. A regression that returned
// ErrDashboardCardLimitReached for a missing card would surface as a 409
// Conflict to the user instead of a 404 Not Found.
func TestMoveCardWithLimit_NonexistentCardReturnsErrNoRows(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-move-1", "mover-1")
	dst := &models.Dashboard{UserID: user.ID, Name: "dst"}
	require.NoError(t, s.CreateDashboard(ctx, dst))

	// Random UUID that does NOT correspond to any row in cards.
	missing := uuid.New()

	err := s.MoveCardWithLimit(ctx, missing, dst.ID, 100)
	require.ErrorIs(t, err, sql.ErrNoRows,
		"MoveCardWithLimit on a nonexistent card must return sql.ErrNoRows, not ErrDashboardCardLimitReached")
	require.NotErrorIs(t, err, ErrDashboardCardLimitReached,
		"missing card must be distinguishable from a limit-reached refusal")
}

// TestMoveCardWithLimit_NonexistentCardWithZeroLimit reinforces the previous
// guarantee at the boundary: when the target dashboard is full (limit=0)
// AND the card doesn't exist, the missing-card branch must still win — the
// COUNT-based subquery keeps the UPDATE at 0 rows affected regardless, and
// the follow-up existence check is what decides which error to surface.
func TestMoveCardWithLimit_NonexistentCardWithZeroLimit(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-move-2", "mover-2")
	dst := &models.Dashboard{UserID: user.ID, Name: "dst-full"}
	require.NoError(t, s.CreateDashboard(ctx, dst))

	// Populate dst so it looks "full" (COUNT >= 0 is trivially true for
	// limit=0). Even so, the missing-card branch must be the outcome.
	filler := &models.Card{
		DashboardID: dst.ID,
		CardType:    models.CardTypeClusterHealth,
		Position:    models.CardPosition{W: 1, H: 1},
	}
	require.NoError(t, s.CreateCard(ctx, filler))

	missing := uuid.New()
	err := s.MoveCardWithLimit(ctx, missing, dst.ID, 0)
	require.ErrorIs(t, err, sql.ErrNoRows)
}

// TestMoveCardWithLimit_LimitBoundaryEnforcement pins the strict `<`
// comparison in the SQL subquery: when the destination already holds
// exactly `maxCards`, the move must fail (COUNT is NOT less than the
// limit), but a move to a dashboard with `maxCards - 1` cards must succeed.
// The existing extra_test only exercises limit=0 vs limit=5-with-1-card,
// which leaves the boundary condition untested.
func TestMoveCardWithLimit_LimitBoundaryEnforcement(t *testing.T) {
	s := newTestStore(t)
	user := createTestUser(t, s, "gh-move-3", "mover-3")
	src := &models.Dashboard{UserID: user.ID, Name: "src"}
	dst := &models.Dashboard{UserID: user.ID, Name: "dst"}
	require.NoError(t, s.CreateDashboard(ctx, src))
	require.NoError(t, s.CreateDashboard(ctx, dst))

	// Card we intend to move.
	moving := &models.Card{
		DashboardID: src.ID,
		CardType:    models.CardTypeClusterHealth,
		Position:    models.CardPosition{W: 1, H: 1},
	}
	require.NoError(t, s.CreateCard(ctx, moving))

	// Two filler cards on dst so it holds exactly 2 cards.
	for i := 0; i < 2; i++ {
		filler := &models.Card{
			DashboardID: dst.ID,
			CardType:    models.CardTypeClusterHealth,
			Position:    models.CardPosition{W: 1, H: 1},
		}
		require.NoError(t, s.CreateCard(ctx, filler))
	}

	// limit == current count → refused (COUNT is not < limit).
	err := s.MoveCardWithLimit(ctx, moving.ID, dst.ID, 2)
	require.ErrorIs(t, err, ErrDashboardCardLimitReached,
		"move must fail when destination already holds exactly maxCards")

	// Card stays in src.
	srcCards, err := s.GetDashboardCards(ctx, src.ID)
	require.NoError(t, err)
	require.Len(t, srcCards, 1)

	// limit == current count + 1 → allowed.
	require.NoError(t, s.MoveCardWithLimit(ctx, moving.ID, dst.ID, 3))

	dstCards, err := s.GetDashboardCards(ctx, dst.ID)
	require.NoError(t, err)
	require.Len(t, dstCards, 3)
}
