package stellar

import (
	"context"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/stellar/providers"
)

func TestTypesCanBeInstantiated(t *testing.T) {
	now := time.Unix(1700000000, 0).UTC()
	later := now.Add(5 * time.Minute)

	tests := []struct {
		name string
		run  func(t *testing.T)
	}{
		{
			name: "Preferences",
			run: func(t *testing.T) {
				prefs := Preferences{
					UserID:          "user-1",
					DefaultProvider: "ollama",
					ExecutionMode:   "manual",
					Timezone:        "UTC",
					ProactiveMode:   true,
					PinnedClusters:  []string{"cluster-a"},
					UpdatedAt:       now,
				}
				if prefs.UserID != "user-1" || len(prefs.PinnedClusters) != 1 {
					t.Fatalf("unexpected preferences contents: %+v", prefs)
				}
			},
		},
		{
			name: "Mission",
			run: func(t *testing.T) {
				mission := Mission{
					ID:             "mission-1",
					UserID:         "user-1",
					Name:           "Check rollout",
					Goal:           "Investigate failing deployment",
					Schedule:       "*/5 * * * *",
					TriggerType:    "schedule",
					ProviderPolicy: "default",
					MemoryScope:    "cluster",
					Enabled:        true,
					ToolBindings:   []string{"kubectl"},
					LastRunAt:      &now,
					NextRunAt:      &later,
					CreatedAt:      now,
					UpdatedAt:      later,
				}
				if mission.ID == "" || mission.NextRunAt == nil || mission.ToolBindings[0] != "kubectl" {
					t.Fatalf("unexpected mission contents: %+v", mission)
				}
			},
		},
		{
			name: "Execution",
			run: func(t *testing.T) {
				execution := Execution{
					ID:            "exec-1",
					MissionID:     "mission-1",
					UserID:        "user-1",
					TriggerType:   "manual",
					TriggerData:   "button",
					Status:        "completed",
					RawInput:      "check deployment",
					EnrichedInput: "check deployment in cluster-a",
					Output:        "all clear",
					ActionsTaken:  "none",
					TokensInput:   10,
					TokensOutput:  5,
					Provider:      "ollama",
					Model:         "llama3",
					DurationMs:    42,
					StartedAt:     now,
					CompletedAt:   &later,
				}
				if execution.CompletedAt == nil || execution.DurationMs != 42 {
					t.Fatalf("unexpected execution contents: %+v", execution)
				}
			},
		},
		{
			name: "MemoryEntry and Action",
			run: func(t *testing.T) {
				entry := MemoryEntry{
					ID:          "mem-1",
					UserID:      "user-1",
					Cluster:     "cluster-a",
					Namespace:   "default",
					Category:    "incident",
					Summary:     "Crash loop detected",
					RawContent:  "pod restarted three times",
					Tags:        []string{"crashloop", "deployment"},
					Importance:  5,
					IncidentID:  "incident-1",
					Embedding:   []byte{1, 2, 3},
					MissionID:   "mission-1",
					ExecutionID: "exec-1",
					ExpiresAt:   &later,
					CreatedAt:   now,
				}
				action := Action{
					ID:             "action-1",
					UserID:         "user-1",
					Description:    "Restart deployment",
					ActionType:     "RestartDeployment",
					Parameters:     "{}",
					Cluster:        "cluster-a",
					Namespace:      "default",
					ScheduledAt:    &later,
					Status:         "pending_approval",
					CreatedBy:      "stellar",
					RetryCount:     1,
					MaxRetries:     3,
					IdempotencyKey: "key-1",
					ConfirmToken:   "token-1",
					CreatedAt:      now,
					UpdatedAt:      later,
				}
				if len(entry.Tags) != 2 || action.ActionType != "RestartDeployment" {
					t.Fatalf("unexpected memory/action contents: %+v %+v", entry, action)
				}
			},
		},
		{
			name: "Notification Task Observation Watch",
			run: func(t *testing.T) {
				notification := Notification{
					ID:                   "note-1",
					UserID:               "user-1",
					Type:                 "incident",
					Severity:             "warning",
					Title:                "Deployment warning",
					Body:                 "Pods are restarting",
					Cluster:              "cluster-a",
					Namespace:            "default",
					MissionID:            "mission-1",
					ActionID:             "action-1",
					DedupeKey:            "cluster-a/default/deploy",
					Status:               "open",
					Read:                 true,
					ReadAt:               &later,
					CreatedAt:            now,
					BatchTimestamp:       &now,
					UpdatedAt:            &later,
					RootCause:            "CrashLoopBackOff",
					AffectedResource:     "deployment/api",
					ErrorMessage:         "restart loop",
					ResolutionNote:       "watching",
					DismissalReason:      "",
					InvestigationSummary: "restarted automatically",
					AutoResolutionStatus: "queued",
					AutoResolutionDetail: "restart pending approval",
				}
				task := Task{
					ID:          "task-1",
					SessionID:   "session-1",
					UserID:      "user-1",
					Cluster:     "cluster-a",
					Title:       "Investigate deployment",
					Description: "Look into restart loop",
					Status:      "open",
					Priority:    1,
					Source:      "stellar",
					ParentID:    "",
					DueAt:       &later,
					CompletedAt: nil,
					ContextJSON: `{"kind":"Deployment"}`,
					CreatedAt:   now,
					UpdatedAt:   later,
				}
				observation := Observation{
					ID:          "obs-1",
					Cluster:     "cluster-a",
					Kind:        "noticed",
					Summary:     "Crash loop noticed",
					Detail:      "Investigating deployment/api",
					Reasoning:   "multiple restarts",
					RefType:     "task",
					RefID:       "task-1",
					ShownToUser: true,
					CreatedAt:   now,
				}
				watch := Watch{
					ID:           "watch-1",
					UserID:       "user-1",
					Cluster:      "cluster-a",
					Namespace:    "default",
					ResourceKind: "Deployment",
					ResourceName: "api",
					Reason:       "crash loop",
					Status:       "active",
					LastEventAt:  &now,
					LastChecked:  &later,
					LastUpdate:   "still restarting",
					ResolvedAt:   nil,
					CreatedAt:    now,
					UpdatedAt:    later,
				}
				if notification.Title == "" || task.ContextJSON == "" || !observation.ShownToUser || watch.ResourceName != "api" {
					t.Fatalf("unexpected notification/task/observation/watch contents: %+v %+v %+v %+v", notification, task, observation, watch)
				}
			},
		},
		{
			name: "ProviderConfig Activity Solve AuditEntry",
			run: func(t *testing.T) {
				cfg := ProviderConfig{
					ID:          "provider-1",
					UserID:      "user-1",
					Provider:    "openai",
					DisplayName: "OpenAI",
					BaseURL:     "https://api.openai.com/v1",
					Model:       "gpt-4o-mini",
					APIKeyEnc:   []byte{9, 9, 9},
					APIKeyMask:  "sk-***",
					IsDefault:   true,
					IsActive:    true,
					LastTested:  &later,
					LastLatency: 123,
					CreatedAt:   now,
					UpdatedAt:   later,
				}
				activity := Activity{
					ID:        "activity-1",
					UserID:    "user-1",
					Ts:        now,
					Kind:      "evaluated",
					EventID:   "event-1",
					SolveID:   "solve-1",
					Cluster:   "cluster-a",
					Namespace: "default",
					Workload:  "deployment/api",
					Title:     "Evaluated event",
					Detail:    "CrashLoopBackOff detected",
					Severity:  "warning",
				}
				solve := Solve{
					ID:            "solve-1",
					EventID:       "event-1",
					UserID:        "user-1",
					Cluster:       "cluster-a",
					Namespace:     "default",
					Workload:      "deployment/api",
					Status:        "resolved_monitored",
					ActionsTaken:  1,
					LimitHit:      "",
					Summary:       "Restart queued",
					Error:         "",
					StartedAt:     now,
					EndedAt:       &later,
					NextRecheckAt: &later,
				}
				audit := AuditEntry{
					ID:         "audit-1",
					Ts:         now,
					UserID:     "user-1",
					Action:     "queue_action",
					EntityType: "action",
					EntityID:   "action-1",
					Cluster:    "cluster-a",
					Detail:     "queued restart action",
				}
				if !cfg.IsDefault || activity.Kind != "evaluated" || solve.NextRecheckAt == nil || audit.EntityType != "action" {
					t.Fatalf("unexpected provider/activity/solve/audit contents: %+v %+v %+v %+v", cfg, activity, solve, audit)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, tt.run)
	}
}

func TestNewStellarEvaluatorAndEvaluateFallback(t *testing.T) {
	evaluator := NewStellarEvaluator(nil)
	if evaluator == nil {
		t.Fatal("expected evaluator instance")
	}

	tests := []struct {
		name            string
		event           RawK8sEvent
		wantShow        bool
		wantSeverity    string
		wantActionType  string
		wantActionHints int
	}{
		{
			name: "critical event gets restart recommendation",
			event: RawK8sEvent{
				Cluster:   "cluster-a",
				Namespace: "default",
				Kind:      "Deployment",
				Name:      "api",
				Reason:    "CrashLoopBackOff",
				Message:   "Back-off restarting failed container",
				Type:      "Warning",
				Count:     3,
			},
			wantShow:        true,
			wantSeverity:    "critical",
			wantActionType:  "RestartDeployment",
			wantActionHints: 2,
		},
		{
			name: "noise event stays ignored",
			event: RawK8sEvent{
				Cluster:   "cluster-a",
				Namespace: "default",
				Kind:      "Pod",
				Name:      "api-123",
				Reason:    "Pulled",
				Message:   "Container image already present",
				Type:      "Normal",
				Count:     1,
			},
			wantShow:        false,
			wantSeverity:    "ignore",
			wantActionType:  "",
			wantActionHints: 0,
		},
		{
			name: "unknown warning is surfaced conservatively",
			event: RawK8sEvent{
				Cluster:   "cluster-a",
				Namespace: "default",
				Kind:      "Pod",
				Name:      "api-123",
				Reason:    "CustomReason",
				Message:   "Something unusual happened",
				Type:      "Warning",
				Count:     1,
			},
			wantShow:        true,
			wantSeverity:    "warning",
			wantActionType:  "",
			wantActionHints: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := evaluator.Evaluate(context.Background(), tt.event, providers.ResolvedProvider{})
			if err != nil {
				t.Fatalf("Evaluate returned error: %v", err)
			}
			if result == nil {
				t.Fatal("expected evaluation result")
			}
			if result.ShouldShow != tt.wantShow {
				t.Fatalf("unexpected ShouldShow: got %v want %v", result.ShouldShow, tt.wantShow)
			}
			if result.Severity != tt.wantSeverity {
				t.Fatalf("unexpected severity: got %q want %q", result.Severity, tt.wantSeverity)
			}
			if len(result.ActionHints) != tt.wantActionHints {
				t.Fatalf("unexpected action hints length: got %d want %d", len(result.ActionHints), tt.wantActionHints)
			}
			if tt.wantActionType == "" {
				if result.RecommendedAction != nil {
					t.Fatalf("did not expect recommended action, got %+v", result.RecommendedAction)
				}
				return
			}
			if result.RecommendedAction == nil {
				t.Fatal("expected recommended action")
			}
			if result.RecommendedAction.Type != tt.wantActionType {
				t.Fatalf("unexpected recommended action type: got %q want %q", result.RecommendedAction.Type, tt.wantActionType)
			}
		})
	}
}
