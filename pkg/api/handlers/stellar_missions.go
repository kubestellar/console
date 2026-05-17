package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/store"
)

func (h *StellarHandler) ListMissions(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	limit := readListLimit(c)
	offset := readListOffset(c)
	missions, err := h.store.ListStellarMissions(c.UserContext(), userID, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load missions"})
	}
	return c.JSON(fiber.Map{"items": missions, "limit": limit})
}

func (h *StellarHandler) GetMission(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	missionID := strings.TrimSpace(c.Params("id"))
	if missionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	mission, err := h.store.GetStellarMission(c.UserContext(), userID, missionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load mission"})
	}
	if mission == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "mission not found"})
	}
	return c.JSON(mission)
}

type upsertStellarMissionRequest struct {
	Name           string   `json:"name"`
	Goal           string   `json:"goal"`
	Schedule       string   `json:"schedule"`
	TriggerType    string   `json:"triggerType"`
	ProviderPolicy string   `json:"providerPolicy"`
	MemoryScope    string   `json:"memoryScope"`
	Enabled        bool     `json:"enabled"`
	ToolBindings   []string `json:"toolBindings"`
}

func (h *StellarHandler) CreateMission(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	mission, err := parseMissionPayload(c)
	if err != nil {
		return err
	}
	mission.UserID = userID
	if err := h.store.CreateStellarMission(c.UserContext(), mission); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create mission"})
	}
	created, err := h.store.GetStellarMission(c.UserContext(), userID, mission.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload mission"})
	}
	return c.Status(fiber.StatusCreated).JSON(created)
}

func (h *StellarHandler) UpdateMission(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	missionID := strings.TrimSpace(c.Params("id"))
	if missionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	existing, err := h.store.GetStellarMission(c.UserContext(), userID, missionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load mission"})
	}
	if existing == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "mission not found"})
	}

	mission, parseErr := parseMissionPayload(c)
	if parseErr != nil {
		return parseErr
	}
	mission.ID = missionID
	mission.UserID = userID
	mission.CreatedAt = existing.CreatedAt
	mission.LastRunAt = existing.LastRunAt
	mission.NextRunAt = existing.NextRunAt

	if err := h.store.UpdateStellarMission(c.UserContext(), mission); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update mission"})
	}
	updated, err := h.store.GetStellarMission(c.UserContext(), userID, missionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload mission"})
	}
	return c.JSON(updated)
}

func (h *StellarHandler) DeleteMission(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	missionID := strings.TrimSpace(c.Params("id"))
	if missionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.DeleteStellarMission(c.UserContext(), userID, missionID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete mission"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}
func parseMissionPayload(c *fiber.Ctx) (*store.StellarMission, error) {
	var body upsertStellarMissionRequest
	if err := c.BodyParser(&body); err != nil {
		return nil, fiber.NewError(fiber.StatusBadRequest, "invalid JSON body")
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" || len(body.Name) > stellarMaxNameLength {
		return nil, fiber.NewError(fiber.StatusBadRequest, "name is required and must be <= 120 chars")
	}
	body.Goal = strings.TrimSpace(body.Goal)
	if body.Goal == "" || len(body.Goal) > stellarMaxGoalLength {
		return nil, fiber.NewError(fiber.StatusBadRequest, "goal is required and must be <= 5000 chars")
	}
	body.Schedule = strings.TrimSpace(body.Schedule)
	if len(body.Schedule) > stellarMaxScheduleLength {
		return nil, fiber.NewError(fiber.StatusBadRequest, "schedule must be <= 128 chars")
	}
	body.TriggerType = strings.TrimSpace(body.TriggerType)
	if body.TriggerType == "" {
		body.TriggerType = stellarDefaultTriggerType
	}
	if !stellarAllowedTriggerTypes[body.TriggerType] {
		return nil, fiber.NewError(fiber.StatusBadRequest, "invalid triggerType")
	}
	body.ProviderPolicy = strings.TrimSpace(body.ProviderPolicy)
	if body.ProviderPolicy == "" {
		body.ProviderPolicy = stellarDefaultProviderPolicy
	}
	body.MemoryScope = strings.TrimSpace(body.MemoryScope)
	if body.MemoryScope == "" {
		body.MemoryScope = stellarDefaultMemoryScope
	}
	if len(body.ToolBindings) > stellarMaxToolsPerMission {
		return nil, fiber.NewError(fiber.StatusBadRequest, "too many toolBindings")
	}
	tools := make([]string, 0, len(body.ToolBindings))
	for _, tool := range body.ToolBindings {
		tool = strings.TrimSpace(tool)
		if tool == "" {
			continue
		}
		if len(tool) > stellarMaxToolNameLength {
			return nil, fiber.NewError(fiber.StatusBadRequest, "tool name too long")
		}
		tools = append(tools, tool)
	}
	return &store.StellarMission{
		Name:           body.Name,
		Goal:           body.Goal,
		Schedule:       body.Schedule,
		TriggerType:    body.TriggerType,
		ProviderPolicy: body.ProviderPolicy,
		MemoryScope:    body.MemoryScope,
		Enabled:        body.Enabled,
		ToolBindings:   tools,
	}, nil
}
