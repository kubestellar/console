package test

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

func (m *MockStore) GetPendingSwap(ctx context.Context, id uuid.UUID) (*models.PendingSwap, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.PendingSwap), args.Error(1)
}

func (m *MockStore) GetUserPendingSwaps(ctx context.Context, userID uuid.UUID, limit, offset int) ([]models.PendingSwap, error) {
	args := m.Called(userID, limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.PendingSwap), args.Error(1)
}

func (m *MockStore) GetDueSwaps(ctx context.Context, limit, offset int) ([]models.PendingSwap, error) {
	args := m.Called(limit, offset)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.PendingSwap), args.Error(1)
}

func (m *MockStore) CreatePendingSwap(ctx context.Context, swap *models.PendingSwap) error {
	args := m.Called(swap)
	return args.Error(0)
}

func (m *MockStore) UpdateSwapStatus(ctx context.Context, id uuid.UUID, status models.SwapStatus) error {
	args := m.Called(id, status)
	return args.Error(0)
}

func (m *MockStore) SnoozeSwap(ctx context.Context, id uuid.UUID, newSwapAt time.Time) error {
	args := m.Called(id, newSwapAt)
	return args.Error(0)
}

func (m *MockStore) RecordEvent(ctx context.Context, event *models.UserEvent) error { return nil }
func (m *MockStore) GetRecentEvents(ctx context.Context, userID uuid.UUID, since time.Duration, limit, offset int) ([]models.UserEvent, error) {
	return nil, nil
}
