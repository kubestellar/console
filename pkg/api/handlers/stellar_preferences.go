package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/store"
)

func (h *StellarHandler) GetPreferences(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	prefs, err := h.store.GetStellarPreferences(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load preferences"})
	}
	return c.JSON(prefs)
}

type putStellarPreferencesRequest struct {
	DefaultProvider string   `json:"defaultProvider"`
	ExecutionMode   string   `json:"executionMode"`
	Timezone        string   `json:"timezone"`
	ProactiveMode   bool     `json:"proactiveMode"`
	PinnedClusters  []string `json:"pinnedClusters"`
}

func (h *StellarHandler) UpdatePreferences(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}

	var body putStellarPreferencesRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.DefaultProvider = strings.TrimSpace(body.DefaultProvider)
	if body.DefaultProvider == "" {
		body.DefaultProvider = stellarDefaultProviderPolicy
	}
	body.ExecutionMode = strings.TrimSpace(body.ExecutionMode)
	if body.ExecutionMode == "" {
		body.ExecutionMode = stellarDefaultExecutionMode
	}
	if !stellarAllowedExecutionModes[body.ExecutionMode] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid executionMode"})
	}
	body.Timezone = strings.TrimSpace(body.Timezone)
	if body.Timezone == "" {
		body.Timezone = stellarDefaultTimezone
	}

	pinned := make([]string, 0, len(body.PinnedClusters))
	for _, cluster := range body.PinnedClusters {
		cluster = strings.TrimSpace(cluster)
		if cluster != "" {
			pinned = append(pinned, cluster)
		}
	}

	if err := h.store.UpdateStellarPreferences(c.UserContext(), &store.StellarPreferences{
		UserID:          userID,
		DefaultProvider: body.DefaultProvider,
		ExecutionMode:   body.ExecutionMode,
		Timezone:        body.Timezone,
		ProactiveMode:   body.ProactiveMode,
		PinnedClusters:  pinned,
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save preferences"})
	}
	updated, err := h.store.GetStellarPreferences(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload preferences"})
	}
	return c.JSON(updated)
}
