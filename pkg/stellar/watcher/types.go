package watcher

import (
	"context"

	"github.com/kubestellar/console/pkg/store"
)

type SSEEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type Broadcaster interface {
	Broadcast(event SSEEvent)
}

type NotificationStore interface {
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
	NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error)
	ListStellarUserIDs(ctx context.Context) ([]string, error)
	CreateStellarMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error
	GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error)
	CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
}
