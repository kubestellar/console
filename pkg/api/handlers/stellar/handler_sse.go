package stellar

import (
	"strings"

	"github.com/kubestellar/console/pkg/store"
)

type stellarSSEClient struct {
	userID  string
	isAdmin bool
	ch      chan SSEEvent
}

func (h *Handler) registerSSEClient(connID, userID string, isAdmin bool, ch chan SSEEvent) {
	h.sseClientsMu.Lock()
	defer h.sseClientsMu.Unlock()
	if h.sseClients == nil {
		h.sseClients = make(map[string]stellarSSEClient)
	}
	h.sseClients[connID] = stellarSSEClient{userID: userID, isAdmin: isAdmin, ch: ch}
}

func (h *Handler) unregisterSSEClient(connID string) {
	h.sseClientsMu.Lock()
	defer h.sseClientsMu.Unlock()
	delete(h.sseClients, connID)
}

func shouldDeliverStellarSSEEvent(client stellarSSEClient, event SSEEvent) bool {
	if event.AdminOnly || event.UserID == stellarSystemUserID || event.UserID == "" {
		return client.isAdmin
	}
	return client.userID == event.UserID || client.isAdmin
}

// broadcastToClients sends an event to SSE clients scoped by the resolved
// audience metadata and optionally narrowed to a specific user connection set.
func (h *Handler) broadcastToClients(event SSEEvent) {
	resolvedEvent := h.resolveSSEEventAudience(event)
	h.sseClientsMu.RLock()
	defer h.sseClientsMu.RUnlock()
	for _, client := range h.sseClients {
		if resolvedEvent.TargetUserID != "" && client.userID != resolvedEvent.TargetUserID && !client.isAdmin {
			continue
		}
		if !shouldDeliverStellarSSEEvent(client, resolvedEvent) {
			continue
		}
		select {
		case client.ch <- resolvedEvent:
		default: // client too slow, skip
		}
	}
}

func (h *Handler) Broadcast(event SSEEvent) {
	h.broadcastToClients(event)
}

type SSEBroadcaster interface {
	Broadcast(event SSEEvent)
}

type SSEEvent struct {
	Type         string      `json:"type"`
	Data         interface{} `json:"data"`
	UserID       string      `json:"userId,omitempty"`
	AdminOnly    bool        `json:"adminOnly,omitempty"`
	TargetUserID string      `json:"-"`
}

func newUserScopedSSEEvent(userID, eventType string, data interface{}) SSEEvent {
	trimmedUserID := strings.TrimSpace(userID)
	return SSEEvent{
		Type:         eventType,
		Data:         data,
		UserID:       trimmedUserID,
		TargetUserID: trimmedUserID,
	}
}

func (h *Handler) resolveSSEEventAudience(event SSEEvent) SSEEvent {
	if event.TargetUserID != "" && event.UserID == "" {
		event.UserID = event.TargetUserID
	}
	if event.AdminOnly || event.UserID != "" {
		return event
	}
	if userID, adminOnly, ok := stellarSSEAudienceFromData(event.Data); ok {
		event.UserID = userID
		event.AdminOnly = adminOnly
		return event
	}
	event.AdminOnly = true
	return event
}

func stellarSSEAudienceFromData(data interface{}) (string, bool, bool) {
	switch item := data.(type) {
	case store.StellarNotification:
		return stellarSSEAudienceFromUserID(item.UserID)
	case *store.StellarNotification:
		if item == nil {
			return "", false, false
		}
		return stellarSSEAudienceFromUserID(item.UserID)
	case store.StellarActivity:
		return stellarSSEAudienceFromUserID(item.UserID)
	case *store.StellarActivity:
		if item == nil {
			return "", false, false
		}
		return stellarSSEAudienceFromUserID(item.UserID)
	case store.StellarAction:
		return stellarSSEAudienceFromUserID(item.UserID)
	case *store.StellarAction:
		if item == nil {
			return "", false, false
		}
		return stellarSSEAudienceFromUserID(item.UserID)
	case store.StellarWatch:
		return stellarSSEAudienceFromUserID(item.UserID)
	case *store.StellarWatch:
		if item == nil {
			return "", false, false
		}
		return stellarSSEAudienceFromUserID(item.UserID)
	case store.StellarSolve:
		return stellarSSEAudienceFromUserID(item.UserID)
	case *store.StellarSolve:
		if item == nil {
			return "", false, false
		}
		return stellarSSEAudienceFromUserID(item.UserID)
	case map[string]string:
		if userID, ok := item["userId"]; ok {
			return stellarSSEAudienceFromUserID(userID)
		}
		if userID, ok := item["userID"]; ok {
			return stellarSSEAudienceFromUserID(userID)
		}
	case map[string]interface{}:
		if raw, ok := item["userId"]; ok {
			if userID, ok := raw.(string); ok {
				return stellarSSEAudienceFromUserID(userID)
			}
		}
		if raw, ok := item["userID"]; ok {
			if userID, ok := raw.(string); ok {
				return stellarSSEAudienceFromUserID(userID)
			}
		}
	}
	return "", false, false
}

func stellarSSEAudienceFromUserID(userID string) (string, bool, bool) {
	trimmedUserID := strings.TrimSpace(userID)
	if trimmedUserID == "" {
		return "", false, false
	}
	if trimmedUserID == stellarSystemUserID {
		return "", true, true
	}
	return trimmedUserID, false, true
}
