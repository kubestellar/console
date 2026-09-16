package test

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

func (m *MockStore) GetDashboard(ctx context.Context, id uuid.UUID) (*models.Dashboard, error) {
	return nil, nil
}
func (m *MockStore) GetUserDashboards(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.Dashboard, error) {
	return nil, nil
}
func (m *MockStore) GetDefaultDashboard(ctx context.Context, userID uuid.UUID) (*models.Dashboard, error) {
	return nil, nil
}
func (m *MockStore) CreateDashboard(ctx context.Context, dashboard *models.Dashboard) error {
	return nil
}
func (m *MockStore) ImportDashboardAtomic(ctx context.Context, dashboard *models.Dashboard, cards []*models.Card, maxCards int) error {
	if dashboard.ID == uuid.Nil {
		dashboard.ID = uuid.New()
	}
	return nil
}
func (m *MockStore) CreateDashboardTx(ctx context.Context, tx *sql.Tx, dashboard *models.Dashboard) error {
	if dashboard.ID == uuid.Nil {
		dashboard.ID = uuid.New()
	}
	return nil
}
func (m *MockStore) UpdateDashboard(ctx context.Context, dashboard *models.Dashboard) error {
	return nil
}
func (m *MockStore) DeleteDashboard(ctx context.Context, id uuid.UUID) error { return nil }

func (m *MockStore) GetCard(ctx context.Context, id uuid.UUID) (*models.Card, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Card), args.Error(1)
}
func (m *MockStore) GetDashboardCards(ctx context.Context, dashboardID uuid.UUID) ([]models.Card, error) {
	return nil, nil
}

func (m *MockStore) CreateCard(ctx context.Context, card *models.Card) error { return nil }
func (m *MockStore) CreateCardTx(ctx context.Context, tx *sql.Tx, card *models.Card) error {
	return nil
}

// CreateCardWithLimit is overridable so tests can exercise both the success
// path and the ErrDashboardCardLimitReached branch of the RBAC/limit check.
func (m *MockStore) CreateCardWithLimit(ctx context.Context, card *models.Card, maxCards int) error {
	if len(m.ExpectedCalls) == 0 {
		return nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "CreateCardWithLimit" {
			args := m.Called(card, maxCards)
			return args.Error(0)
		}
	}
	return nil
}

func (m *MockStore) UpdateCard(ctx context.Context, card *models.Card) error {
	args := m.Called(card)
	return args.Error(0)
}

func (m *MockStore) DeleteCard(ctx context.Context, id uuid.UUID) error {
	args := m.Called(id)
	return args.Error(0)
}

func (m *MockStore) UpdateCardFocus(ctx context.Context, cardID uuid.UUID, summary string) error {
	args := m.Called(cardID, summary)
	return args.Error(0)
}

// MoveCardWithLimit is overridable so tests can exercise both the success
// path and the ErrDashboardCardLimitReached branch of the atomic move.
func (m *MockStore) MoveCardWithLimit(ctx context.Context, cardID uuid.UUID, targetDashboardID uuid.UUID, maxCards int) error {
	if len(m.ExpectedCalls) == 0 {
		return nil
	}
	for _, call := range m.ExpectedCalls {
		if call.Method == "MoveCardWithLimit" {
			args := m.Called(cardID, targetDashboardID, maxCards)
			return args.Error(0)
		}
	}
	return nil
}

func (m *MockStore) AddCardHistory(ctx context.Context, history *models.CardHistory) error {
	args := m.Called(history)
	return args.Error(0)
}
func (m *MockStore) GetUserCardHistory(ctx context.Context, userID uuid.UUID, limit int) ([]models.CardHistory, error) {
	return nil, nil
}
