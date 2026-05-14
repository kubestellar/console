package stellar

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/kubestellar/console/pkg/stellar/providers"
)

// RawK8sEvent represents an incoming Kubernetes event for evaluation.
// Mirrors handlers.IncomingEvent but lives here to avoid circular imports.
type RawK8sEvent struct {
	Cluster   string
	Namespace string
	Kind      string
	Name      string
	Reason    string
	Message   string
	Type      string // "Warning" or "Normal"
	Count     int32
}

// EvaluationResult is what the evaluator returns after LLM or fallback assessment.
type EvaluationResult struct {
	ShouldShow        bool                `json:"should_show"`
	Severity          string              `json:"severity"`     // "critical" | "warning" | "info" | "ignore"
	Reasoning         string              `json:"reasoning"`    // why this decision was made
	ActionHints       []string            `json:"action_hints"` // e.g. ["scale", "restart", "investigate"]
	RecommendedAction *RecommendedAction  `json:"recommended_action,omitempty"`
}

// RecommendedAction describes a concrete action Stellar should auto-queue
// (as pending_approval) so the user can one-click execute it.
// Only populated for unambiguous failure cases — never for in-progress
// lifecycle events (rolling updates, scaling, normal pulls, etc.).
type RecommendedAction struct {
	Type      string `json:"type"`      // e.g. "RestartDeployment"
	Reasoning string `json:"reasoning"` // short why
}

// StellarEvaluator decides if a K8s event is worth showing the user by asking
// the configured LLM provider. Falls back to deterministic rules when the LLM
// is unavailable or returns unparseable output.
type StellarEvaluator struct {
	providerRegistry *providers.Registry
}

// NewStellarEvaluator creates an evaluator wired to the given provider registry.
func NewStellarEvaluator(reg *providers.Registry) *StellarEvaluator {
	return &StellarEvaluator{providerRegistry: reg}
}

const evaluatorMaxTokens = 200
const evaluatorTemperature = 0.1

// Evaluate runs the event through the user's LLM and returns a decision.
// If the LLM call or JSON parsing fails, it transparently falls back to rules.
func (e *StellarEvaluator) Evaluate(
	ctx context.Context,
	event RawK8sEvent,
	resolved providers.ResolvedProvider,
) (*EvaluationResult, error) {
	if resolved.Provider == nil {
		return e.FallbackEvaluate(event), nil
	}

	prompt := fmt.Sprintf(`You are evaluating a Kubernetes event. Decide if it's worth showing to the user, and whether Stellar should auto-queue a remediation.

Event reason: %s
Resource: %s/%s (%s) on cluster %s
Message: %s
Count: %d
Type: %s

Severity decision:
- CRITICAL: actual failure that needs action (CrashLoopBackOff, OOMKilling, FailedScheduling, Evicted, NodeNotReady, FailedMount)
- WARNING: failed/unhealthy but not yet critical (BackOff, Failed, Unhealthy)
- INFO: noteworthy informational, no action required
- IGNORE: normal lifecycle (Pulling, Pulled, Scheduled, Created, Started, SuccessfulCreate, SuccessfulDelete, ScalingReplicaSet, SuccessfulRescale, NoPods, DeploymentRollout, RolloutTriggered)

Action recommendation rules (BE CONSERVATIVE):
- Only set "recommended_action.type" for unambiguous failure cases.
- NEVER recommend an action for in-progress lifecycle events (rolling updates, scale-up/down, normal pulls, "Successful*" reasons).
- Valid types: "RestartDeployment" — only when a Deployment's pods are crash-looping or stuck unhealthy AND a restart could plausibly help.
- For OOMKilled, FailedScheduling, Evicted, or NodeNotReady: do NOT recommend RestartDeployment — those need investigation, not a restart.
- If unsure, omit "recommended_action" entirely.

Respond ONLY with valid JSON. Examples:
{"should_show":true,"severity":"critical","reasoning":"crash loop","action_hints":["investigate","restart"],"recommended_action":{"type":"RestartDeployment","reasoning":"3+ crash restarts suggest stuck rollout"}}
{"should_show":false,"severity":"ignore","reasoning":"normal rolling update"}
{"should_show":true,"severity":"warning","reasoning":"liveness probe failing","action_hints":["investigate"]}`,
		event.Reason,
		event.Namespace, event.Name, event.Kind,
		event.Cluster,
		event.Message,
		event.Count,
		event.Type,
	)

	resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   evaluatorMaxTokens,
		Temperature: evaluatorTemperature,
		Messages:    []providers.Message{{Role: "user", Content: prompt}},
	})
	if err != nil {
		slog.Warn("stellar/evaluator: LLM call failed, using fallback", "error", err)
		return e.FallbackEvaluate(event), nil
	}

	var result EvaluationResult
	content := strings.TrimSpace(resp.Content)
	// Strip markdown fences if the model wraps JSON in ```json ... ```
	if strings.HasPrefix(content, "```") {
		if idx := strings.Index(content[3:], "\n"); idx >= 0 {
			content = content[3+idx+1:]
		}
		content = strings.TrimSuffix(content, "```")
		content = strings.TrimSpace(content)
	}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		slog.Warn("stellar/evaluator: JSON parse failed, using fallback",
			"error", err, "raw", content)
		return e.FallbackEvaluate(event), nil
	}

	// Validate severity value
	switch result.Severity {
	case "critical", "warning", "info", "ignore":
		// valid
	default:
		slog.Warn("stellar/evaluator: unknown severity from LLM, using fallback",
			"severity", result.Severity)
		return e.FallbackEvaluate(event), nil
	}

	return &result, nil
}

// criticalReasons are K8s event reasons that always warrant user attention.
var criticalReasons = map[string]bool{
	"CrashLoopBackOff": true,
	"OOMKilling":       true,
	"OOMKilled":        true,
	"Evicted":          true,
	"FailedScheduling": true,
	"NodeNotReady":     true,
	"FailedMount":      true,
}

// warningReasons are K8s event reasons worth showing but not urgent.
var warningReasons = map[string]bool{
	"BackOff":   true,
	"Failed":    true,
	"Unhealthy": true,
}

// noiseReasons are K8s event reasons that are never worth showing.
// Includes rolling-update / scaling / normal lifecycle reasons.
var noiseReasons = map[string]bool{
	"Pulling": true, "Pulled": true, "Created": true,
	"Started": true, "Scheduled": true, "SuccessfulCreate": true,
	"ScalingReplicaSet": true, "SuccessfulDelete": true,
	"NoPods": true, "SuccessfulRescale": true,
	"DeploymentRollout": true, "RolloutTriggered": true,
	"NewReplicaSet": true, "ReplicaSetUpdated": true,
	"Killing": true, // expected during rollouts
}

// restartableReasons are the only reasons that may auto-queue a RestartDeployment.
// Notably absent: OOMKilled (needs root-cause), FailedScheduling (capacity issue),
// Evicted (node issue), NodeNotReady (cluster-level), FailedMount (volume issue).
var restartableReasons = map[string]bool{
	"CrashLoopBackOff": true,
	"BackOff":          true,
}

// FallbackEvaluate uses deterministic rules when the LLM is unavailable.
func (e *StellarEvaluator) FallbackEvaluate(event RawK8sEvent) *EvaluationResult {
	// Noise check first — beats criticalReasons in case of overlap.
	if noiseReasons[event.Reason] {
		return &EvaluationResult{
			ShouldShow:  false,
			Severity:    "ignore",
			Reasoning:   "Normal lifecycle event",
			ActionHints: []string{},
		}
	}
	if criticalReasons[event.Reason] {
		hints := []string{"investigate"}
		var rec *RecommendedAction
		if restartableReasons[event.Reason] {
			hints = append(hints, "restart")
			rec = &RecommendedAction{
				Type:      "RestartDeployment",
				Reasoning: "Critical " + event.Reason + " — restart may clear stuck pods",
			}
		}
		return &EvaluationResult{
			ShouldShow:        true,
			Severity:          "critical",
			Reasoning:         "Known critical event type",
			ActionHints:       hints,
			RecommendedAction: rec,
		}
	}
	if warningReasons[event.Reason] {
		hints := []string{"investigate"}
		var rec *RecommendedAction
		if restartableReasons[event.Reason] {
			hints = append(hints, "restart")
			rec = &RecommendedAction{
				Type:      "RestartDeployment",
				Reasoning: event.Reason + " — pod stuck in restart loop, rollout restart may clear it",
			}
		}
		return &EvaluationResult{
			ShouldShow:        true,
			Severity:          "warning",
			Reasoning:         "Known warning event type",
			ActionHints:       hints,
			RecommendedAction: rec,
		}
	}
	if strings.EqualFold(event.Type, "Warning") {
		return &EvaluationResult{
			ShouldShow:  true,
			Severity:    "warning",
			Reasoning:   "Unknown warning event, showing as precaution",
			ActionHints: []string{"investigate"},
		}
	}
	return &EvaluationResult{
		ShouldShow:  false,
		Severity:    "ignore",
		Reasoning:   "Normal event, not worth showing",
		ActionHints: []string{},
	}
}
