package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	missionsAPITimeout   = 30 * time.Second
	missionsMaxBodyBytes = 10 * 1024 * 1024 // 10MB
)

// MissionsHandler handles mission-related API endpoints (knowledge base browsing,
// validation, sharing).
type MissionsHandler struct {
	httpClient    *http.Client
	githubAPIURL  string // defaults to "https://api.github.com"
	githubRawURL  string // defaults to "https://raw.githubusercontent.com"
}

// NewMissionsHandler creates a new MissionsHandler with default settings.
func NewMissionsHandler() *MissionsHandler {
	return &MissionsHandler{
		httpClient:   &http.Client{Timeout: missionsAPITimeout},
		githubAPIURL: "https://api.github.com",
		githubRawURL: "https://raw.githubusercontent.com",
	}
}

// RegisterRoutes registers all mission routes on the given Fiber router group.
func (h *MissionsHandler) RegisterRoutes(g fiber.Router) {
	g.Get("/kb/browse", h.BrowseConsoleKB)
	g.Get("/kb/file", h.GetMissionFile)
	g.Post("/validate", h.ValidateMission)
	g.Post("/share/slack", h.ShareToSlack)
	g.Post("/share/github", h.ShareToGitHub)
}

// ---------- Browse knowledge base ----------

// BrowseConsoleKB lists directory contents from the kubestellar/console repo.
// GET /api/missions/kb/browse?path=missions
func (h *MissionsHandler) BrowseConsoleKB(c *fiber.Ctx) error {
	path := c.Query("path", "")
	url := fmt.Sprintf("%s/repos/kubestellar/console/contents/%s", h.githubAPIURL, path)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build request"})
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	if token := c.Get("X-GitHub-Token"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "upstream request failed"})
	}
	defer resp.Body.Close()

	limitedBody := io.LimitReader(resp.Body, missionsMaxBodyBytes)
	body, _ := io.ReadAll(limitedBody)
	if resp.StatusCode != http.StatusOK {
		return c.Status(resp.StatusCode).JSON(fiber.Map{"error": "GitHub API error", "status": resp.StatusCode})
	}

	c.Set("Content-Type", "application/json")
	return c.Send(body)
}

// ---------- Get a single file ----------

// GetMissionFile fetches raw file content from the kubestellar/console repo.
// GET /api/missions/kb/file?path=missions/example.yaml&ref=main
func (h *MissionsHandler) GetMissionFile(c *fiber.Ctx) error {
	path := c.Query("path")
	if path == "" {
		return c.Status(400).JSON(fiber.Map{"error": "path query parameter is required"})
	}
	ref := c.Query("ref", "main")

	url := fmt.Sprintf("%s/kubestellar/console/%s/%s", h.githubRawURL, ref, path)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build request"})
	}

	if token := c.Get("X-GitHub-Token"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "upstream request failed"})
	}
	defer resp.Body.Close()

	limitedBody := io.LimitReader(resp.Body, missionsMaxBodyBytes)
	body, _ := io.ReadAll(limitedBody)
	if resp.StatusCode == http.StatusNotFound {
		return c.Status(404).JSON(fiber.Map{"error": "file not found"})
	}
	if resp.StatusCode != http.StatusOK {
		return c.Status(resp.StatusCode).JSON(fiber.Map{"error": "GitHub raw content error"})
	}

	c.Set("Content-Type", "text/plain")
	return c.Send(body)
}

// ---------- Validate a mission ----------

// MissionSpec is the minimal structure for a kc-mission-v1 document.
type MissionSpec struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Metadata   struct {
		Name string `json:"name"`
	} `json:"metadata"`
	Spec struct {
		Description string `json:"description"`
	} `json:"spec"`
}

// ValidateMission validates a kc-mission-v1 JSON payload.
// POST /api/missions/validate
func (h *MissionsHandler) ValidateMission(c *fiber.Ctx) error {
	body := c.Body()
	if len(body) == 0 {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": []string{"empty body"}})
	}
	if len(body) > missionsMaxBodyBytes {
		return c.Status(413).JSON(fiber.Map{"valid": false, "errors": []string{"payload too large"}})
	}

	var mission MissionSpec
	if err := json.Unmarshal(body, &mission); err != nil {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": []string{"invalid JSON: " + err.Error()}})
	}

	var errs []string
	if mission.APIVersion != "kc-mission-v1" {
		errs = append(errs, "apiVersion must be 'kc-mission-v1'")
	}
	if mission.Kind == "" {
		errs = append(errs, "kind is required")
	}
	if mission.Metadata.Name == "" {
		errs = append(errs, "metadata.name is required")
	}

	if len(errs) > 0 {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": errs})
	}
	return c.JSON(fiber.Map{"valid": true})
}

// ---------- Share to Slack ----------

// SlackShareRequest is the payload for sharing a mission to Slack.
type SlackShareRequest struct {
	WebhookURL string `json:"webhookUrl"`
	Text       string `json:"text"`
}

// ShareToSlack posts a message to a Slack webhook.
// POST /api/missions/share/slack
func (h *MissionsHandler) ShareToSlack(c *fiber.Ctx) error {
	var req SlackShareRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.WebhookURL == "" || !strings.HasPrefix(req.WebhookURL, "https://hooks.slack.com/") {
		return c.Status(400).JSON(fiber.Map{"error": "invalid or missing webhook URL"})
	}
	if req.Text == "" {
		return c.Status(400).JSON(fiber.Map{"error": "text is required"})
	}

	payload, _ := json.Marshal(map[string]string{"text": req.Text})
	httpReq, err := http.NewRequest("POST", req.WebhookURL, bytes.NewReader(payload))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build request"})
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "slack webhook request failed"})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("slack returned status %d", resp.StatusCode)})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ---------- Share to GitHub (fork → branch → commit → PR) ----------

// GitHubShareRequest is the payload for sharing a mission to GitHub as a PR.
type GitHubShareRequest struct {
	Repo     string `json:"repo"`     // e.g. "kubestellar/console"
	FilePath string `json:"filePath"` // path in repo
	Content  string `json:"content"`  // file content (base64)
	Message  string `json:"message"`  // commit message
	Branch   string `json:"branch"`   // new branch name
}

// ShareToGitHub creates a PR with the mission file.
// POST /api/missions/share/github
func (h *MissionsHandler) ShareToGitHub(c *fiber.Ctx) error {
	token := c.Get("X-GitHub-Token")
	if token == "" {
		return c.Status(401).JSON(fiber.Map{"error": "X-GitHub-Token header is required"})
	}

	var req GitHubShareRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Repo == "" || req.FilePath == "" || req.Content == "" || req.Branch == "" {
		return c.Status(400).JSON(fiber.Map{"error": "repo, filePath, content, and branch are required"})
	}

	// Step 1: Fork the repo
	forkURL := fmt.Sprintf("%s/repos/%s/forks", h.githubAPIURL, req.Repo)
	forkReq, _ := http.NewRequest("POST", forkURL, nil)
	forkReq.Header.Set("Authorization", "Bearer "+token)
	forkReq.Header.Set("Accept", "application/vnd.github.v3+json")
	forkResp, err := h.httpClient.Do(forkReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to fork repo"})
	}
	defer forkResp.Body.Close()

	if forkResp.StatusCode < 200 || forkResp.StatusCode >= 300 {
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub fork failed with status %d", forkResp.StatusCode)})
	}
	var forkData map[string]interface{}
	if err := json.NewDecoder(forkResp.Body).Decode(&forkData); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to decode fork response"})
	}
	forkFullName, _ := forkData["full_name"].(string)
	if forkFullName == "" {
		return c.Status(502).JSON(fiber.Map{"error": "fork response missing full_name"})
	}

	// Step 2: Get HEAD SHA from fork's main branch, then create new branch ref
	mainRefURL := fmt.Sprintf("%s/repos/%s/git/ref/heads/main", h.githubAPIURL, forkFullName)
	mainRefReq, _ := http.NewRequest("GET", mainRefURL, nil)
	mainRefReq.Header.Set("Authorization", "Bearer "+token)
	mainRefReq.Header.Set("Accept", "application/vnd.github.v3+json")
	mainRefResp, err := h.httpClient.Do(mainRefReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to get main branch ref"})
	}
	defer mainRefResp.Body.Close()

	var refData map[string]interface{}
	if err := json.NewDecoder(mainRefResp.Body).Decode(&refData); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to decode ref response"})
	}
	obj, _ := refData["object"].(map[string]interface{})
	headSHA, _ := obj["sha"].(string)
	if headSHA == "" {
		return c.Status(502).JSON(fiber.Map{"error": "could not resolve HEAD SHA for main branch"})
	}

	refURL := fmt.Sprintf("%s/repos/%s/git/refs", h.githubAPIURL, forkFullName)
	refPayload, _ := json.Marshal(map[string]string{
		"ref": "refs/heads/" + req.Branch,
		"sha": headSHA,
	})
	refReq, _ := http.NewRequest("POST", refURL, bytes.NewReader(refPayload))
	refReq.Header.Set("Authorization", "Bearer "+token)
	refReq.Header.Set("Accept", "application/vnd.github.v3+json")
	h.httpClient.Do(refReq) //nolint:errcheck // best-effort

	// Step 3: Create/update file (commit)
	fileURL := fmt.Sprintf("%s/repos/%s/contents/%s", h.githubAPIURL, forkFullName, req.FilePath)
	filePayload, _ := json.Marshal(map[string]string{
		"message": req.Message,
		"content": req.Content,
		"branch":  req.Branch,
	})
	fileReq, _ := http.NewRequest("PUT", fileURL, bytes.NewReader(filePayload))
	fileReq.Header.Set("Authorization", "Bearer "+token)
	fileReq.Header.Set("Accept", "application/vnd.github.v3+json")
	fileResp, err := h.httpClient.Do(fileReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to commit file"})
	}
	defer fileResp.Body.Close()

	// Step 4: Create PR
	prURL := fmt.Sprintf("%s/repos/%s/pulls", h.githubAPIURL, req.Repo)
	prPayload, _ := json.Marshal(map[string]interface{}{
		"title": req.Message,
		"head":  strings.Split(forkFullName, "/")[0] + ":" + req.Branch,
		"base":  "main",
		"body":  "Mission shared via KubeStellar Console",
	})
	prReq, _ := http.NewRequest("POST", prURL, bytes.NewReader(prPayload))
	prReq.Header.Set("Authorization", "Bearer "+token)
	prReq.Header.Set("Accept", "application/vnd.github.v3+json")
	prResp, err := h.httpClient.Do(prReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to create PR"})
	}
	defer prResp.Body.Close()

	var prData map[string]interface{}
	json.NewDecoder(prResp.Body).Decode(&prData)
	prHTMLURL, _ := prData["html_url"].(string)

	return c.JSON(fiber.Map{
		"success": true,
		"pr_url":  prHTMLURL,
		"fork":    forkFullName,
	})
}
