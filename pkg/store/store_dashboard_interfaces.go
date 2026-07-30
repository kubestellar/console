package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// DashboardStore manages dashboard records.
type DashboardStore interface {
	GetDashboard(ctx context.Context, id uuid.UUID) (*models.Dashboard, error)
	CountUserDashboards(ctx context.Context, userID uuid.UUID) (int, error)
	GetUserDashboards(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.Dashboard, error)
	GetDefaultDashboard(ctx context.Context, userID uuid.UUID) (*models.Dashboard, error)
	CreateDashboard(ctx context.Context, dashboard *models.Dashboard) error
	ImportDashboardAtomic(ctx context.Context, dashboard *models.Dashboard, cards []*models.Card, maxCards int) error
	UpdateDashboard(ctx context.Context, dashboard *models.Dashboard) error
	DeleteDashboard(ctx context.Context, id uuid.UUID) error
}

// CardStore manages dashboard cards.
type CardStore interface {
	GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error)
	GetDashboardCards(ctx context.Context, dashboardID uuid.UUID) ([]models.Card, error)
	CreateCard(ctx context.Context, card *models.Card) error
	CreateCardWithLimit(ctx context.Context, card *models.Card, maxCards int) error
	UpdateCard(ctx context.Context, card *models.Card) error
	MoveCardWithLimit(ctx context.Context, cardID uuid.UUID, targetDashboardID uuid.UUID, maxCards int) error
	DeleteCard(ctx context.Context, id uuid.UUID) error
	UpdateCardFocus(ctx context.Context, cardID uuid.UUID, summary string) error
}

// CardHistoryStore manages recently viewed card history.
type CardHistoryStore interface {
	AddCardHistory(ctx context.Context, history *models.CardHistory) error
	GetUserCardHistory(ctx context.Context, userID uuid.UUID, limit int) ([]models.CardHistory, error)
}

// PendingSwapStore manages card swap suggestions.
type PendingSwapStore interface {
	GetPendingSwap(ctx context.Context, id uuid.UUID) (*models.PendingSwap, error)
	GetUserPendingSwaps(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.PendingSwap, error)
	GetDueSwaps(ctx context.Context, limit, offset int) ([]models.PendingSwap, error)
	CreatePendingSwap(ctx context.Context, swap *models.PendingSwap) error
	UpdateSwapStatus(ctx context.Context, id uuid.UUID, status models.SwapStatus) error
	SnoozeSwap(ctx context.Context, id uuid.UUID, newSwapAt time.Time) error
}
