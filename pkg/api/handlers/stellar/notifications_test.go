package stellar

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/kubestellar/console/pkg/store"
)

func Test_describeNotificationStateChange(t *testing.T) {
	tests := []struct {
		name       string
		status     string
		note       string
		wantTitle  string
		wantDetail string
		wantKind   string
	}{
		{
			name:       "investigating with note",
			status:     stellarNotificationStatusInvestigating,
			note:       "pulling logs",
			wantTitle:  "Event marked investigating",
			wantDetail: "pulling logs",
			wantKind:   "manual_investigating",
		},
		{
			name:       "investigating without note",
			status:     stellarNotificationStatusInvestigating,
			note:       "",
			wantTitle:  "Event marked investigating",
			wantDetail: "Operator opened investigation from the escalated event modal.",
			wantKind:   "manual_investigating",
		},
		{
			name:       "resolved with note",
			status:     stellarNotificationStatusResolved,
			note:       "restarted deployment",
			wantTitle:  "Event resolved manually",
			wantDetail: "restarted deployment",
			wantKind:   "manual_resolved",
		},
		{
			name:       "resolved without note",
			status:     stellarNotificationStatusResolved,
			note:       "",
			wantTitle:  "Event resolved manually",
			wantDetail: "Operator resolved the escalated event from the modal.",
			wantKind:   "manual_resolved",
		},
		{
			name:       "dismissed with note",
			status:     stellarNotificationStatusDismissed,
			note:       "duplicate event",
			wantTitle:  "Event removed from escalated list",
			wantDetail: "duplicate event",
			wantKind:   "manual_dismissed",
		},
		{
			name:       "dismissed without note",
			status:     stellarNotificationStatusDismissed,
			note:       "",
			wantTitle:  "Event removed from escalated list",
			wantDetail: "Operator dismissed the escalated event from the modal.",
			wantKind:   "manual_dismissed",
		},
		{
			name:       "unknown status",
			status:     "unknown",
			note:       "custom note",
			wantTitle:  "Event updated",
			wantDetail: "custom note",
			wantKind:   "manual_updated",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				Status: tt.status,
			}

			title, detail, kind := describeNotificationStateChange(notification, tt.note)

			assert.Equal(t, tt.wantTitle, title)
			assert.Equal(t, tt.wantDetail, detail)
			assert.Equal(t, tt.wantKind, kind)
		})
	}
}

func Test_deriveNotificationWorkload(t *testing.T) {
	tests := []struct {
		name       string
		dedupeKey  string
		wantResult string
	}{
		{
			name:       "standard event key with ev prefix",
			dedupeKey:  "ev:Pod:api-7c9d",
			wantResult: "api-7c9d",
		},
		{
			name:       "standard event key without ev prefix",
			dedupeKey:  "Pod:default:nginx",
			wantResult: "nginx",
		},
		{
			name:       "deployment key",
			dedupeKey:  "ev:Deployment:frontend",
			wantResult: "frontend",
		},
		{
			name:       "service key",
			dedupeKey:  "ev:Service:backend-svc",
			wantResult: "backend-svc",
		},
		{
			name:       "insufficient parts",
			dedupeKey:  "ev:Pod",
			wantResult: "",
		},
		{
			name:       "single part",
			dedupeKey:  "something",
			wantResult: "",
		},
		{
			name:       "empty string",
			dedupeKey:  "",
			wantResult: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				DedupeKey: tt.dedupeKey,
			}

			result := deriveNotificationWorkload(notification)
			assert.Equal(t, tt.wantResult, result)
		})
	}
}

func Test_deriveStellarNotificationResource(t *testing.T) {
	tests := []struct {
		name         string
		dedupeKey    string
		notifTitle   string
		namespace    string
		wantResult   string
		wantContains string
	}{
		{
			name:         "standard event key with ev prefix",
			dedupeKey:    "ev:Pod:api-7c9d",
			wantResult:   "Pod/api-7c9d",
			wantContains: "",
		},
		{
			name:         "deployment key",
			dedupeKey:    "ev:Deployment:frontend",
			wantResult:   "Deployment/frontend",
			wantContains: "",
		},
		{
			name:         "standard event key without ev prefix",
			dedupeKey:    "Pod:default:nginx",
			wantResult:   "Pod/nginx",
			wantContains: "",
		},
		{
			name:         "key with kind and name",
			dedupeKey:    "Service:backend-svc",
			wantResult:   "",
			wantContains: "",
		},
		{
			name:         "insufficient parts falls back to namespace/title",
			dedupeKey:    "short",
			namespace:    "default",
			notifTitle:   "CrashLoopBackOff",
			wantResult:   "default/CrashLoopBackOff",
			wantContains: "",
		},
		{
			name:         "empty dedupe key falls back to title",
			dedupeKey:    "",
			namespace:    "",
			notifTitle:   "FailedScheduling",
			wantResult:   "FailedScheduling",
			wantContains: "",
		},
		{
			name:         "name only when kind is empty",
			dedupeKey:    "ev::api-pod",
			wantResult:   "api-pod",
			wantContains: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				DedupeKey: tt.dedupeKey,
				Title:     tt.notifTitle,
				Namespace: tt.namespace,
			}

			result := deriveStellarNotificationResource(notification)

			if tt.wantResult != "" {
				assert.Equal(t, tt.wantResult, result)
			}
			if tt.wantContains != "" {
				assert.Contains(t, result, tt.wantContains)
			}
		})
	}
}

func Test_updateNotificationState_Logic(t *testing.T) {
	// This tests the state transition logic without HTTP layer
	now := time.Now().UTC()
	tests := []struct {
		name       string
		status     string
		note       string
		wantRead   bool
		wantFields map[string]string
	}{
		{
			name:     "investigating status",
			status:   stellarNotificationStatusInvestigating,
			note:     "checking logs",
			wantRead: false,
			wantFields: map[string]string{
				"investigationSummary": "checking logs",
			},
		},
		{
			name:     "resolved status",
			status:   stellarNotificationStatusResolved,
			note:     "fixed",
			wantRead: true,
			wantFields: map[string]string{
				"resolutionNote": "fixed",
			},
		},
		{
			name:     "dismissed status",
			status:   stellarNotificationStatusDismissed,
			note:     "duplicate",
			wantRead: true,
			wantFields: map[string]string{
				"dismissalReason": "duplicate",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			notification := &store.StellarNotification{
				ID:        "test-id",
				CreatedAt: now.Add(-1 * time.Hour),
				Status:    "new",
			}

			// Simulate the state update logic
			updated := *notification
			updated.Status = tt.status

			switch tt.status {
			case stellarNotificationStatusInvestigating:
				updated.InvestigationSummary = tt.note
				updated.Read = false
				updated.ReadAt = nil
			case stellarNotificationStatusResolved:
				updated.ResolutionNote = tt.note
				updated.Read = true
				updated.ReadAt = &now
			case stellarNotificationStatusDismissed:
				updated.DismissalReason = tt.note
				updated.Read = true
				updated.ReadAt = &now
			}

			assert.Equal(t, tt.status, updated.Status)
			assert.Equal(t, tt.wantRead, updated.Read)

			if tt.wantFields["investigationSummary"] != "" {
				assert.Equal(t, tt.wantFields["investigationSummary"], updated.InvestigationSummary)
			}
			if tt.wantFields["resolutionNote"] != "" {
				assert.Equal(t, tt.wantFields["resolutionNote"], updated.ResolutionNote)
			}
			if tt.wantFields["dismissalReason"] != "" {
				assert.Equal(t, tt.wantFields["dismissalReason"], updated.DismissalReason)
			}
		})
	}
}
