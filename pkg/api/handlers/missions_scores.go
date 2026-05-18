package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ---------- Score Exposure ----------

func (h *MissionsHandler) fetchMissionIndex(c *fiber.Ctx) (*indexJsonFormat, error) {
	cacheKey := "index:master:fixes/index.json"
	url := fmt.Sprintf("%s/kubestellar/console-kb/master/fixes/index.json", h.githubRawURL)

	res, err := h.fetchWithCache(c, cacheKey, url, "(index json)")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch index: %w", err)
	}

	var body = res.Body
	if res.CacheStatus == cacheStatusMiss {
		if res.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GitHub raw content error")
		}

		h.cache.set(cacheKey, &missionsCacheEntry{
			body:        res.Body,
			contentType: "application/json",
			statusCode:  http.StatusOK,
			fetchedAt:   time.Now(),
		})
		slog.Info("[missions] cache MISS, stored (index json)", "bytes", len(res.Body))
	}

	var index indexJsonFormat
	if err := json.Unmarshal(body, &index); err != nil {
		slog.Error("[missions] failed to parse index json", "error", err)
		return nil, fmt.Errorf("failed to parse index")
	}
	return &index, nil
}

// GetKBScores fetches scores across projects
// GET /api/missions/scores?limit=N&offset=M
func (h *MissionsHandler) GetKBScores(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{"count": 1, "scores": []fiber.Map{
			{
				"path":         "fixes/demo/demo-123.json",
				"title":        "Demo Mission",
				"project":      "demo",
				"qualityScore": 85,
				"qualityPass":  true,
			},
		}, "hasMore": false, "limit": defaultScoresPageLimit, "offset": 0})
	}
	index, err := h.fetchMissionIndex(c)
	if err != nil {
		slog.Error("[missions] failed to fetch mission index (scores)", "error", err)
		return c.Status(502).JSON(fiber.Map{"error": "failed to fetch mission index"})
	}

	// Filter just the scoring related fields
	results := make([]fiber.Map, 0, len(index.Missions))
	for _, m := range index.Missions {
		if m.QualityScore != nil {
			project := "unknown"
			if len(m.CncfProjects) > 0 {
				project = m.CncfProjects[0]
			}
			results = append(results, fiber.Map{
				"path":         m.Path,
				"title":        m.Title,
				"project":      project,
				"qualityScore": m.QualityScore,
				"qualityPass":  m.QualityPass,
			})
		}
	}

	limit := c.QueryInt("limit", defaultScoresPageLimit)
	if limit < 1 {
		limit = 1
	}
	if limit > maxScoresPageLimit {
		limit = maxScoresPageLimit
	}
	offset := c.QueryInt("offset", 0)
	if offset < 0 {
		offset = 0
	}
	if offset > len(results) {
		offset = len(results)
	}

	end := offset + limit
	if end > len(results) {
		end = len(results)
	}
	page := results[offset:end]

	return c.JSON(fiber.Map{
		"count":   len(results),
		"scores":  page,
		"hasMore": end < len(results),
		"limit":   limit,
		"offset":  offset,
	})
}

// GetMissionScore fetches score breakdown for a specific entry
// GET /api/missions/scores/:project/:id
func (h *MissionsHandler) GetMissionScore(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{
			"path":               "fixes/demo/demo-123.json",
			"project":            "demo",
			"title":              "Demo Mission",
			"qualityScore":       85,
			"qualityBreakdown":   map[string]interface{}{"structure": 90, "completeness": 80},
			"qualityIssues":      []string{},
			"qualitySuggestions": []string{"Improve context"},
		})
	}

	project := c.Params("project")
	id := c.Params("id")

	index, err := h.fetchMissionIndex(c)
	if err != nil {
		slog.Error("[missions] failed to fetch mission index (score)", "project", project, "id", id, "error", err)
		return c.Status(502).JSON(fiber.Map{"error": "failed to fetch mission index"})
	}

	for _, m := range index.Missions {
		mProject := "unknown"
		if len(m.CncfProjects) > 0 {
			mProject = m.CncfProjects[0]
		}
		// Match by project and filename. Accept both "foo" and "foo.json" from
		// callers so URL construction on the frontend is flexible.
		mBase := path.Base(m.Path)
		if mProject == project && (strings.TrimSuffix(mBase, ".json") == strings.TrimSuffix(id, ".json")) {
			if m.QualityScore == nil {
				return c.Status(404).JSON(fiber.Map{"error": "Mission found but has no score associated"})
			}
			return c.JSON(fiber.Map{
				"path":               m.Path,
				"project":            mProject,
				"title":              m.Title,
				"qualityScore":       m.QualityScore,
				"qualityBreakdown":   m.QualityBreakdown,
				"qualityIssues":      m.QualityIssues,
				"qualitySuggestions": m.QualitySuggestions,
			})
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "KB mission not found"})
}
