package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/stellar/scheduler"
	"github.com/kubestellar/console/pkg/store"
)

type createStellarActionRequest struct {
	Description string         `json:"description"`
	ActionType  string         `json:"actionType"`
	Parameters  map[string]any `json:"parameters"`
	Cluster     string         `json:"cluster"`
	Namespace   string         `json:"namespace"`
	ScheduledAt string         `json:"scheduledAt"`
	CronExpr    string         `json:"cronExpr"`
}

func (h *StellarHandler) ListActions(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	_ = h.processDueActions(c.UserContext(), userID)
	limit := readListLimit(c)
	offset := readListOffset(c)
	status := strings.TrimSpace(c.Query("status"))
	items, err := h.store.ListStellarActions(c.UserContext(), userID, status, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load actions"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *StellarHandler) GetAction(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	actionID := strings.TrimSpace(c.Params("id"))
	if actionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	item, err := h.store.GetStellarAction(c.UserContext(), userID, actionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load action"})
	}
	if item == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "action not found"})
	}
	return c.JSON(item)
}

func (h *StellarHandler) CreateAction(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	var body createStellarActionRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Description = strings.TrimSpace(body.Description)
	body.ActionType = strings.TrimSpace(body.ActionType)
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Namespace = strings.TrimSpace(body.Namespace)
	body.CronExpr = strings.TrimSpace(body.CronExpr)
	if body.Description == "" || body.ActionType == "" || body.Cluster == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "description, actionType, and cluster are required"})
	}
	parametersJSON, err := json.Marshal(body.Parameters)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid parameters"})
	}
	var scheduledAt *time.Time
	if strings.TrimSpace(body.ScheduledAt) != "" {
		parsed, parseErr := time.Parse(time.RFC3339, body.ScheduledAt)
		if parseErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "scheduledAt must be RFC3339"})
		}
		scheduledAt = &parsed
	}
	action := &store.StellarAction{
		UserID:      userID,
		Description: body.Description,
		ActionType:  body.ActionType,
		Parameters:  string(parametersJSON),
		Cluster:     body.Cluster,
		Namespace:   body.Namespace,
		ScheduledAt: scheduledAt,
		CronExpr:    body.CronExpr,
		Status:      "pending_approval",
		CreatedBy:   userID,
	}
	if err := h.store.CreateStellarAction(c.UserContext(), action); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create action"})
	}
	_ = h.store.CreateStellarNotification(c.UserContext(), &store.StellarNotification{
		UserID:    userID,
		Type:      "ActionRequired",
		Severity:  "warning",
		Title:     "Action requires approval",
		Body:      fmt.Sprintf("%s on %s is waiting for confirmation.", body.ActionType, body.Cluster),
		Cluster:   body.Cluster,
		Namespace: body.Namespace,
		ActionID:  action.ID,
	})
	created, err := h.store.GetStellarAction(c.UserContext(), userID, action.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload action"})
	}
	return c.Status(fiber.StatusCreated).JSON(created)
}

func (h *StellarHandler) ApproveAction(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	if s, ok := h.store.(store.Store); ok {
		if err := requireEditorOrAdmin(c, s); err != nil {
			return err
		}
	}
	actionID := strings.TrimSpace(c.Params("id"))
	if actionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	item, err := h.store.GetStellarAction(c.UserContext(), userID, actionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to approve action"})
	}
	if item == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "action not found"})
	}
	if item.Status != "pending_approval" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "action is not pending approval"})
	}
	var req struct {
		ConfirmToken string `json:"confirmToken"`
	}
	_ = c.BodyParser(&req)
	destructive := isDestructiveAction(item.ActionType)
	if destructive {
		if req.ConfirmToken == "" || req.ConfirmToken != item.ConfirmToken {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "confirm_token required for destructive action"})
		}
		if item.CreatedBy == userID {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "cannot self-approve destructive actions"})
		}
	}
	if err := h.store.ApproveStellarAction(c.UserContext(), userID, actionID, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to approve action"})
	}
	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		detailBytes, _ := json.Marshal(map[string]string{"confirmToken": req.ConfirmToken})
		_ = auditable.CreateAuditEntry(c.UserContext(), &store.StellarAuditEntry{
			UserID:     userID,
			Action:     "approve_action",
			EntityType: "action",
			EntityID:   actionID,
			Cluster:    item.Cluster,
			Detail:     string(detailBytes),
		})
	}
	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{
			Type: "action_updated",
			Data: map[string]string{"id": actionID, "status": "approved"},
		})
	}
	_ = h.processDueActions(c.UserContext(), userID)
	item, _ = h.store.GetStellarAction(c.UserContext(), userID, actionID)
	return c.JSON(item)
}

type rejectActionRequest struct {
	Reason string `json:"reason"`
}

func (h *StellarHandler) RejectAction(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	actionID := strings.TrimSpace(c.Params("id"))
	if actionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	var body rejectActionRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	if err := h.store.RejectStellarAction(c.UserContext(), userID, actionID, userID, strings.TrimSpace(body.Reason)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reject action"})
	}
	_ = h.store.CreateStellarNotification(c.UserContext(), &store.StellarNotification{
		UserID:   userID,
		Type:     "MissionUpdate",
		Severity: "info",
		Title:    "Action rejected",
		Body:     "The scheduled action was rejected and will not run.",
		ActionID: actionID,
	})
	item, err := h.store.GetStellarAction(c.UserContext(), userID, actionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load action"})
	}
	if item == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "action not found"})
	}
	return c.JSON(item)
}

func (h *StellarHandler) DeleteAction(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	actionID := strings.TrimSpace(c.Params("id"))
	if actionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.DeleteStellarAction(c.UserContext(), userID, actionID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete action"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// executeActionMaxTimeout is the maximum duration for immediate action dispatch.
const executeActionMaxTimeout = 2 * time.Minute

type executeActionRequest struct {
	ActionType  string         `json:"actionType"`
	Description string         `json:"description"`
	Cluster     string         `json:"cluster"`
	Namespace   string         `json:"namespace"`
	Name        string         `json:"name"`
	Parameters  map[string]any `json:"parameters"`
	Prompt      string         `json:"prompt"`
}

// knownDispatchableActions lists action types that can be dispatched to K8s directly.
var knownDispatchableActions = map[string]bool{
	"RestartDeployment": true,
	"ScaleDeployment":   true,
	"DeletePod":         true,
	"CordonNode":        true,
}

// ExecuteAction creates and immediately executes a Stellar action.
// For known K8s action types, dispatches directly via the scheduler.
// For "investigate" or unknown types, falls back to an LLM call.
func (h *StellarHandler) ExecuteAction(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	var body executeActionRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.ActionType = strings.TrimSpace(body.ActionType)
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Namespace = strings.TrimSpace(body.Namespace)
	body.Name = strings.TrimSpace(body.Name)
	body.Description = strings.TrimSpace(body.Description)
	body.Prompt = strings.TrimSpace(body.Prompt)

	if body.Cluster == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster is required"})
	}
	if body.Description == "" && body.Prompt != "" {
		body.Description = body.Prompt
	}
	if body.Description == "" {
		body.Description = fmt.Sprintf("%s on %s/%s", body.ActionType, body.Namespace, body.Name)
	}

	// Merge name/namespace into parameters for dispatch compatibility
	params := body.Parameters
	if params == nil {
		params = map[string]any{}
	}
	if body.Name != "" {
		params["name"] = body.Name
	}
	if body.Namespace != "" {
		params["namespace"] = body.Namespace
	}

	// If it's a dispatchable K8s action and we have a k8s client, execute directly
	if knownDispatchableActions[body.ActionType] && h.k8sClient != nil {
		return h.executeDirectAction(c, userID, body, params)
	}

	// Fall back to LLM-based execution (investigate, scale without params, etc.)
	return h.executeLLMAction(c, userID, body)
}

func (h *StellarHandler) executeDirectAction(c *fiber.Ctx, userID string, body executeActionRequest, params map[string]any) error {
	parametersJSON, err := json.Marshal(params)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid parameters"})
	}

	now := time.Now().UTC()
	action := &store.StellarAction{
		UserID:      userID,
		Description: body.Description,
		ActionType:  body.ActionType,
		Parameters:  string(parametersJSON),
		Cluster:     body.Cluster,
		Namespace:   body.Namespace,
		Status:      "approved",
		CreatedBy:   userID,
		ApprovedBy:  userID,
		ApprovedAt:  &now,
	}
	if err := h.store.CreateStellarAction(c.UserContext(), action); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create action"})
	}

	_ = h.store.UpdateStellarActionStatus(c.UserContext(), action.ID, "running", "", "")

	execCtx, cancel := context.WithTimeout(c.UserContext(), executeActionMaxTimeout)
	defer cancel()

	outcome, dispatchErr := scheduler.Dispatch(execCtx, h.k8sClient, *action)
	startTime := now
	durationMs := int(time.Since(startTime).Milliseconds())

	status := "completed"
	if dispatchErr != nil {
		status = "failed"
		outcome = "action execution failed"
		slog.Error("stellar: action execution failed", "action_id", action.ID, "error", dispatchErr)
	}

	_ = h.store.UpdateStellarActionStatus(c.UserContext(), action.ID, status, outcome, "")

	// Record execution
	completedAt := time.Now().UTC()
	triggerData, _ := json.Marshal(map[string]string{"actionType": body.ActionType, "cluster": body.Cluster})
	_ = h.store.CreateStellarExecution(c.UserContext(), &store.StellarExecution{
		UserID:      userID,
		MissionID:   "action-execute",
		TriggerType: "stellar-action",
		TriggerData: string(triggerData),
		Status:      status,
		RawInput:    body.Description,
		Output:      outcome,
		DurationMs:  durationMs,
		StartedAt:   startTime,
		CompletedAt: &completedAt,
	})

	// Audit entry
	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		_ = auditable.CreateAuditEntry(c.UserContext(), &store.StellarAuditEntry{
			UserID:     userID,
			Action:     "execute_action",
			EntityType: "action",
			EntityID:   action.ID,
			Cluster:    body.Cluster,
			Detail:     body.Description,
		})
	}

	// Notification for the result
	notifSeverity := "info"
	notifTitle := "Action completed: " + body.ActionType
	if status == "failed" {
		notifSeverity = "warning"
		notifTitle = "Action failed: " + body.ActionType
	}
	_ = h.store.CreateStellarNotification(c.UserContext(), &store.StellarNotification{
		UserID:    userID,
		Type:      "action",
		Severity:  notifSeverity,
		Title:     notifTitle,
		Body:      outcome,
		Cluster:   body.Cluster,
		Namespace: body.Namespace,
		ActionID:  action.ID,
		DedupeKey: fmt.Sprintf("exec:%s", action.ID),
	})

	// Memory entry
	_ = h.store.CreateStellarMemoryEntry(c.UserContext(), &store.StellarMemoryEntry{
		UserID:     userID,
		Cluster:    body.Cluster,
		Namespace:  body.Namespace,
		Category:   "action",
		Summary:    fmt.Sprintf("%s %s: %s", body.ActionType, status, outcome),
		Importance: 7,
		ExpiresAt:  ptr(time.Now().AddDate(0, 0, 60)),
	})

	// Broadcast via SSE
	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{Type: "action_update", Data: map[string]string{
			"id": action.ID, "status": status, "outcome": outcome,
		}})
	}

	return c.JSON(fiber.Map{
		"id":       action.ID,
		"status":   status,
		"outcome":  outcome,
		"duration": durationMs,
	})
}

func (h *StellarHandler) executeLLMAction(c *fiber.Ctx, userID string, body executeActionRequest) error {
	prompt := body.Prompt
	if prompt == "" {
		prompt = body.Description
	}

	resolved, err := h.resolveProviderAndModel(c.UserContext(), userID, "", "")
	if err != nil || resolved.Provider == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "no AI provider configured"})
	}

	state, _ := h.buildOperationalState(c.UserContext(), userID, body.Cluster)
	if state == nil {
		state = &StellarOperationalState{
			GeneratedAt:      time.Now().UTC(),
			EventCounts:      map[string]int{"critical": 0, "warning": 0, "info": 0},
			RecentEvents:     []store.ClusterEvent{},
			ClustersWatching: []string{},
		}
	}
	memories, _ := h.store.ListStellarMemoryEntries(c.UserContext(), userID, body.Cluster, "", 5, 0)
	tasks, _ := h.store.GetOpenTasks(c.UserContext(), userID)
	contextString := buildLLMContext(state, memories, tasks, body.Cluster)

	messages := []providers.Message{
		{Role: "system", Content: prompts.MissionExecution},
		{Role: "user", Content: "Current cluster state:\n" + contextString},
		{Role: "assistant", Content: "Got it. What do you need?"},
		{Role: "user", Content: fmt.Sprintf("Cluster: %s\nNamespace: %s\nResource: %s\n\nTask: %s", body.Cluster, body.Namespace, body.Name, prompt)},
	}

	startTime := time.Now()
	generated, genErr := resolved.Provider.Generate(c.UserContext(), providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   500,
		Temperature: 0.2,
		Messages:    messages,
	})
	durationMs := int(time.Since(startTime).Milliseconds())

	if genErr != nil {
		slog.Error("stellar: action-execute LLM call failed", "error", genErr, "userID", userID)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI provider error"})
	}

	completedAt := time.Now().UTC()
	triggerData2, _ := json.Marshal(map[string]string{"actionType": body.ActionType, "cluster": body.Cluster})
	_ = h.store.CreateStellarExecution(c.UserContext(), &store.StellarExecution{
		UserID:       userID,
		MissionID:    "action-execute",
		TriggerType:  "stellar-action",
		TriggerData:  string(triggerData2),
		Status:       "completed",
		RawInput:     prompt,
		Output:       generated.Content,
		TokensInput:  generated.TokensInput,
		TokensOutput: generated.TokensOutput,
		Provider:     generated.Provider,
		Model:        generated.Model,
		DurationMs:   durationMs,
		StartedAt:    startTime,
		CompletedAt:  &completedAt,
	})

	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		_ = auditable.CreateAuditEntry(c.UserContext(), &store.StellarAuditEntry{
			UserID:     userID,
			Action:     "execute_action",
			EntityType: "mission",
			EntityID:   "llm-action",
			Cluster:    body.Cluster,
			Detail:     prompt,
		})
	}

	return c.JSON(fiber.Map{
		"id":       "llm-" + uuid.New().String()[:8],
		"status":   "completed",
		"outcome":  generated.Content,
		"model":    generated.Model,
		"provider": generated.Provider,
		"duration": durationMs,
	})
}
