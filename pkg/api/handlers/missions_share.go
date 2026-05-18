package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/audit"
)

// missionsDefaultShareRepos is the built-in allowlist of repositories that
// ShareToGitHub will create PRs against. Operators can extend this via the
// KC_ALLOWED_SHARE_REPOS environment variable (comma-separated list of
// `owner/repo` entries). #6439 — without an allowlist, a misbehaving client
// could point the handler at any repository the user's PAT has write access
// to, using the console's UI as a confused-deputy PR-creation service.
// console-kb is the canonical destination because shared missions land in the
// community mission library (the same repo GetMissionFile reads from).
var missionsDefaultShareRepos = []string{
	"kubestellar/console-kb",
}

// resolveAllowedShareRepos returns the effective allowlist of `owner/repo`
// destinations for ShareToGitHub. The built-in defaults are always included;
// any entries from KC_ALLOWED_SHARE_REPOS are appended. Empty/whitespace
// entries are ignored.
func resolveAllowedShareRepos() []string {
	allowed := make([]string, 0, len(missionsDefaultShareRepos)+1)
	allowed = append(allowed, missionsDefaultShareRepos...)
	if extra := os.Getenv(allowedShareRepoEnvVar); extra != "" {
		for _, r := range strings.Split(extra, ",") {
			r = strings.TrimSpace(r)
			if r != "" {
				allowed = append(allowed, r)
			}
		}
	}
	return allowed
}

// isRepoAllowedForShare reports whether the given `owner/repo` string is on
// the effective ShareToGitHub allowlist.
//
// #6453(B) — Comparison is case-INSENSITIVE. GitHub itself treats owner/repo
// slugs as case-insensitive in both URLs and API calls, so we do the same here
// to be forgiving of operator casing in KC_ALLOWED_SHARE_REPOS (e.g. a value
// of `Kubestellar/Console-KB` will still match a request for
// `kubestellar/console-kb`). Previously the check was exact-match, which was
// stricter than GitHub's own handling and caused spurious 400s. See also
// isRepoAllowedForShareWithList for the path that avoids re-parsing the env
// var on every call.
func isRepoAllowedForShare(repo string) bool {
	return isRepoAllowedForShareWithList(repo, resolveAllowedShareRepos())
}

// isRepoAllowedForShareWithList is the inner, list-accepting form of
// isRepoAllowedForShare. #6453(A) — ShareToGitHub resolves the allowlist once
// per request and passes it through to this function for the membership check
// AND for the error-response payload, avoiding a double call to
// resolveAllowedShareRepos() (which re-parses KC_ALLOWED_SHARE_REPOS and could
// observe a different value between calls if the env changes mid-request).
func isRepoAllowedForShareWithList(repo string, allowed []string) bool {
	repoLower := strings.ToLower(repo)
	for _, a := range allowed {
		if repoLower == strings.ToLower(a) {
			return true
		}
	}
	return false
}

// ---------- Share to Slack ----------

// validateSlackWebhookURL parses the given URL and enforces a strict
// allowlist: HTTPS only, host MUST equal hooks.slack.com (no subdomain or
// userinfo tricks), and path MUST start with /services/. Returns an error
// describing the rejection reason, or nil if the URL is safe.
//
// SECURITY (#6416): The previous check used
// `strings.HasPrefix(url, "https://hooks.slack.com/")` which accepted
// several bypass shapes depending on how URL parsers canonicalize the
// request:
//   - `https://hooks.slack.com/@attacker.evil/` — rejected by prefix but
//     the HasPrefix check is still structural, not semantic, so any
//     addition of URL grammar (userinfo, fragments, etc.) risks bypass
//     when the parser normalizes.
//   - `https://hooks.slack.com\\@attacker.evil/` — backslash is a
//     separator in some parsers (WHATWG) but not Go's net/url, producing
//     host mismatches across components.
//   - `https://hooks.slack.com/` followed by an open redirect path — not
//     strictly an SSRF but exfiltrates the webhook token.
//
// Parsing explicitly and comparing parsed.Host to the literal allowed
// host eliminates the whole class of prefix-based bypasses.
func validateSlackWebhookURL(rawURL string) error {
	if rawURL == "" {
		return fmt.Errorf("webhook URL is required")
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("webhook URL is not a valid URL")
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("webhook URL must use https")
	}
	// User info (user:pass@host) is never valid for a Slack webhook and is
	// the most common SSRF smuggling shape — reject outright.
	if parsed.User != nil {
		return fmt.Errorf("webhook URL must not include userinfo")
	}
	// Host must match EXACTLY; no subdomains, no suffix tricks. Hostname()
	// strips any port, which Slack never uses, but we guard against that
	// below anyway by rejecting non-empty Port().
	if parsed.Hostname() != validSlackWebhookHost {
		return fmt.Errorf("webhook URL host must be %s", validSlackWebhookHost)
	}
	if parsed.Port() != "" {
		return fmt.Errorf("webhook URL must not specify a port")
	}
	if !strings.HasPrefix(parsed.Path, validSlackWebhookPathPrefix) {
		return fmt.Errorf("webhook URL path must begin with %s", validSlackWebhookPathPrefix)
	}
	return nil
}

// ShareToSlack posts a message to a Slack webhook.
// POST /api/missions/share/slack
func (h *MissionsHandler) ShareToSlack(c *fiber.Ctx) error {
	var req SlackShareRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := validateSlackWebhookURL(req.WebhookURL); err != nil {
		slog.Warn("[missions] invalid slack webhook URL", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid webhook URL"})
	}
	if req.Text == "" {
		return c.Status(400).JSON(fiber.Map{"error": "text is required"})
	}
	// #6817 — Cap outbound Slack message size. Without this, a caller can
	// POST a multi-MB text body that gets serialized into the Slack webhook
	// payload and buffered in-process.
	if len(req.Text) > slackMaxTextBytes {
		return c.Status(400).JSON(fiber.Map{"error": fmt.Sprintf("text exceeds maximum size (%d bytes)", slackMaxTextBytes)})
	}

	payload, err := json.Marshal(map[string]string{"text": req.Text})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to marshal payload"})
	}
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
		// #6817 — Drain the response body before returning so the underlying
		// TCP connection can be reused by the transport pool. defer Close()
		// alone does not guarantee the body is fully consumed.
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("slack returned status %d", resp.StatusCode)})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ---------- Share to GitHub (fork → branch → commit → PR) ----------

// ShareToGitHub creates a PR with the mission file.
// POST /api/missions/share/github
func (h *MissionsHandler) ShareToGitHub(c *fiber.Ctx) error {
	token := c.Get("X-GitHub-Token")
	if token == "" {
		return c.Status(401).JSON(fiber.Map{"error": "X-GitHub-Token header is required"})
	}

	// #6419 — Reject oversized payloads before parsing. A misbehaving or
	// malicious client could post up to missionsMaxBodyBytes (10 MiB) of
	// base64-encoded content, which the handler would then hold in memory
	// while making 4 sequential GitHub API calls (fork, ref, commit, PR)
	// with missionsAPITimeout (30s) each — pinning a goroutine for up to
	// two minutes per request. Cap the share endpoint at
	// missionsGitHubShareMaxBytes (1 MiB), which is more than enough for
	// a kc-mission-v1 JSON document.
	if len(c.Body()) > missionsGitHubShareMaxBytes {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
			"error":   "payload too large",
			"maxSize": missionsGitHubShareMaxBytes,
		})
	}

	var req GitHubShareRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Repo == "" || req.FilePath == "" || req.Content == "" || req.Branch == "" {
		return c.Status(400).JSON(fiber.Map{"error": "repo, filePath, content, and branch are required"})
	}

	// SECURITY #6439 — Enforce an allowlist on req.Repo. Without this, a
	// misbehaving client could supply any owner/repo value and use the
	// handler as a confused-deputy PR-creation service against whatever
	// repositories the caller's PAT can write to. The default allowlist
	// contains only `kubestellar/console-kb` (the canonical destination for
	// shared missions); operators can append more via KC_ALLOWED_SHARE_REPOS.
	//
	// #6453(A) — Resolve the allowlist exactly ONCE per request and reuse it
	// for both the membership check and the error-response payload. The
	// previous version called resolveAllowedShareRepos() twice on the reject
	// path, duplicating env parsing and creating a small race window where
	// the error message could disagree with the check if KC_ALLOWED_SHARE_REPOS
	// changed between the two calls.
	allowedShareRepos := resolveAllowedShareRepos()
	if !isRepoAllowedForShareWithList(req.Repo, allowedShareRepos) {
		return c.Status(400).JSON(fiber.Map{
			"error":         "repo is not on the share allowlist",
			"allowed_repos": allowedShareRepos,
		})
	}

	// SECURITY: Validate path and branch to prevent traversal/injection
	if _, err := sanitizePath(req.FilePath); err != nil {
		slog.Error("[MissionsHandler] invalid filePath", "filePath", req.FilePath, "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid filePath"})
	}
	if _, err := sanitizeRef(req.Branch); err != nil {
		slog.Error("[MissionsHandler] invalid branch", "branch", req.Branch, "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid branch"})
	}

	// Step 1: Fork the repo
	forkURL := fmt.Sprintf("%s/repos/%s/forks", h.githubAPIURL, req.Repo)
	forkReq, err := http.NewRequest("POST", forkURL, nil)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build fork request"})
	}
	forkReq.Header.Set("Authorization", "Bearer "+token)
	forkReq.Header.Set("Accept", "application/vnd.github.v3+json")
	forkReq.Header.Set("Content-Type", "application/json") // #7133 — required by GitHub API
	forkResp, err := h.httpClient.Do(forkReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to fork repo"})
	}
	defer forkResp.Body.Close()

	if forkResp.StatusCode < 200 || forkResp.StatusCode >= 300 {
		// #7137 — Drain response body so the TCP connection returns to the pool.
		io.Copy(io.Discard, io.LimitReader(forkResp.Body, 1<<20)) //nolint:errcheck // best-effort drain
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub fork failed with status %d", forkResp.StatusCode)})
	}
	var forkData map[string]interface{}
	if err := json.NewDecoder(forkResp.Body).Decode(&forkData); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to decode fork response"})
	}
	forkFullName, _ := forkData["full_name"].(string)
	if forkFullName == "" || !strings.Contains(forkFullName, "/") {
		return c.Status(502).JSON(fiber.Map{"error": "fork response missing or malformed full_name"})
	}

	// Detect the target repo's default branch (e.g. "main", "master", or custom).
	// The fork response includes the parent's default_branch, but we also fall back
	// to querying the upstream repo directly if the field is missing.
	defaultBranch := "main"
	if parent, ok := forkData["parent"].(map[string]interface{}); ok {
		if db, ok := parent["default_branch"].(string); ok && db != "" {
			defaultBranch = db
		}
	} else if db, ok := forkData["default_branch"].(string); ok && db != "" {
		defaultBranch = db
	}

	// #7135 — Always query the upstream repo for its default branch. The fork
	// response's parent.default_branch or default_branch fields may disagree
	// with the actual upstream value (e.g. a fork created before a rename from
	// "master" to "main"). Querying the upstream is the only reliable source.
	// Previously this only fired when defaultBranch == "main", missing repos
	// that use "master", "trunk", or other non-default names (#6795).
	{
		upstreamURL := fmt.Sprintf("%s/repos/%s", h.githubAPIURL, req.Repo)
		upstreamReq, err := http.NewRequest("GET", upstreamURL, nil)
		if err == nil {
			upstreamReq.Header.Set("Authorization", "Bearer "+token)
			upstreamReq.Header.Set("Accept", "application/vnd.github.v3+json")
			upstreamResp, err := h.httpClient.Do(upstreamReq)
			if err == nil {
				defer upstreamResp.Body.Close()
				if upstreamResp.StatusCode == http.StatusOK {
					var repoData map[string]interface{}
					if json.NewDecoder(upstreamResp.Body).Decode(&repoData) == nil {
						if db, ok := repoData["default_branch"].(string); ok && db != "" {
							defaultBranch = db
						}
					}
				} else {
					// #7137 — Drain on non-200 so TCP connection is reused.
					io.Copy(io.Discard, io.LimitReader(upstreamResp.Body, 1<<20)) //nolint:errcheck
				}
			}
		}
	}

	// Step 2: Get HEAD SHA from fork's default branch, then create new branch ref.
	// After fork creation, GitHub may not have the ref ready immediately (#2382).
	// Retry with exponential backoff to handle this race condition.
	mainRefURL := fmt.Sprintf("%s/repos/%s/git/ref/heads/%s", h.githubAPIURL, forkFullName, defaultBranch)
	var headSHA string
	backoff := forkHeadSHAInitialBackoff
	for attempt := 0; attempt < forkHeadSHAMaxRetries; attempt++ {
		mainRefReq, err := http.NewRequest("GET", mainRefURL, nil)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to build ref request"})
		}
		mainRefReq.Header.Set("Authorization", "Bearer "+token)
		mainRefReq.Header.Set("Accept", "application/vnd.github.v3+json")
		mainRefResp, err := h.httpClient.Do(mainRefReq)
		if err != nil {
			return c.Status(502).JSON(fiber.Map{"error": "failed to get main branch ref"})
		}

		refData, decodeErr := func() (map[string]interface{}, error) {
			defer mainRefResp.Body.Close()
			var data map[string]interface{}
			err := json.NewDecoder(mainRefResp.Body).Decode(&data)
			return data, err
		}()
		if decodeErr != nil {
			return c.Status(502).JSON(fiber.Map{"error": "failed to decode ref response"})
		}

		if mainRefResp.StatusCode == http.StatusOK {
			obj, _ := refData["object"].(map[string]interface{})
			sha, _ := obj["sha"].(string)
			if sha != "" {
				headSHA = sha
				break
			}
		}

		// If this is not the last attempt, wait before retrying.
		// Use select with context cancellation so the retry is
		// abortable when the client disconnects (#6819).
		if attempt < forkHeadSHAMaxRetries-1 {
			slog.Info("[missions] fork HEAD SHA not yet available, retrying",
				"attempt", attempt+1, "maxRetries", forkHeadSHAMaxRetries, "status", mainRefResp.StatusCode, "backoff", backoff)
			select {
			case <-time.After(backoff):
				// backoff elapsed, continue to next attempt
			case <-c.UserContext().Done():
				return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
					"error": "request cancelled while waiting for fork to initialize",
					"code":  "request_cancelled",
				})
			}
			backoff = time.Duration(float64(backoff) * forkHeadSHABackoffMultiplier)
		}
	}
	if headSHA == "" {
		// #6420 — After exhausting the retry budget, return 504 Gateway
		// Timeout instead of 502. 504 is the correct status for "upstream
		// didn't respond in time"; 502 implies the upstream returned an
		// error response, which isn't the case here (we got 404 or 200
		// without an object SHA). The frontend should retry this specific
		// error (eventual consistency) rather than surfacing it as a hard
		// failure.
		return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{
			"error": fmt.Sprintf("could not resolve HEAD SHA for fork's %s branch after retries; GitHub fork is still initializing — retry in a few seconds", defaultBranch),
			"code":  "fork_not_ready",
		})
	}

	refURL := fmt.Sprintf("%s/repos/%s/git/refs", h.githubAPIURL, forkFullName)
	refPayload, err := json.Marshal(map[string]string{
		"ref": "refs/heads/" + req.Branch,
		"sha": headSHA,
	})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to marshal branch ref payload"})
	}
	refReq, err := http.NewRequest("POST", refURL, bytes.NewReader(refPayload))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build branch ref request"})
	}
	refReq.Header.Set("Authorization", "Bearer "+token)
	refReq.Header.Set("Accept", "application/vnd.github.v3+json")
	refReq.Header.Set("Content-Type", "application/json") // #7133 — required by GitHub API
	branchResp, err := h.httpClient.Do(refReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to create branch ref"})
	}
	defer branchResp.Body.Close()
	if branchResp.StatusCode < 200 || branchResp.StatusCode >= 300 {
		// 422 (Unprocessable Entity) means the branch already exists, which is acceptable.
		// #6835 — Eagerly drain the response body so the underlying HTTP/1.1
		// connection is returned to the pool immediately instead of waiting for
		// the deferred Close at function return (which may be 3+ HTTP calls later).
		io.Copy(io.Discard, io.LimitReader(branchResp.Body, 1<<20)) //nolint:errcheck // best-effort drain
		if branchResp.StatusCode != http.StatusUnprocessableEntity {
			return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub branch creation failed with status %d", branchResp.StatusCode)})
		}
	}

	// Step 3: Create/update file (commit)
	fileURL := fmt.Sprintf("%s/repos/%s/contents/%s", h.githubAPIURL, forkFullName, req.FilePath)
	filePayload, err := json.Marshal(map[string]string{
		"message": req.Message,
		"content": req.Content,
		"branch":  req.Branch,
	})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to marshal file commit payload"})
	}
	fileReq, err := http.NewRequest("PUT", fileURL, bytes.NewReader(filePayload))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build file commit request"})
	}
	fileReq.Header.Set("Authorization", "Bearer "+token)
	fileReq.Header.Set("Accept", "application/vnd.github.v3+json")
	fileReq.Header.Set("Content-Type", "application/json") // #6842 — required by GitHub Contents API
	fileResp, err := h.httpClient.Do(fileReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to commit file"})
	}
	defer fileResp.Body.Close()

	// Validate commit response status (#2384) and content (#2381)
	if fileResp.StatusCode < 200 || fileResp.StatusCode >= 300 {
		// #7137 — Drain response body so the TCP connection returns to the pool.
		io.Copy(io.Discard, io.LimitReader(fileResp.Body, 1<<20)) //nolint:errcheck // best-effort drain
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub commit failed with status %d", fileResp.StatusCode)})
	}
	var commitData map[string]interface{}
	if err := json.NewDecoder(fileResp.Body).Decode(&commitData); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to decode commit response"})
	}
	// The GitHub Contents API returns a "content" object with "sha" on success
	commitContent, _ := commitData["content"].(map[string]interface{})
	commitSHA, _ := commitContent["sha"].(string)
	if commitSHA == "" {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub commit response missing expected content SHA"})
	}

	// Step 4: Create PR
	prURL := fmt.Sprintf("%s/repos/%s/pulls", h.githubAPIURL, req.Repo)
	prPayload, err := json.Marshal(map[string]interface{}{
		"title": req.Message,
		"head":  strings.SplitN(forkFullName, "/", 2)[0] + ":" + req.Branch, // #7138 — SplitN guards against missing "/"
		"base":  defaultBranch,
		"body":  "Mission shared via KubeStellar Console",
	})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to marshal PR payload"})
	}
	prReq, err := http.NewRequest("POST", prURL, bytes.NewReader(prPayload))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build PR request"})
	}
	prReq.Header.Set("Authorization", "Bearer "+token)
	prReq.Header.Set("Accept", "application/vnd.github.v3+json")
	prReq.Header.Set("Content-Type", "application/json") // #7133 — required by GitHub API
	prResp, err := h.httpClient.Do(prReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to create PR"})
	}
	defer prResp.Body.Close()

	// Validate PR creation response (#2384)
	if prResp.StatusCode < 200 || prResp.StatusCode >= 300 {
		// #7137 — Drain response body so the TCP connection returns to the pool.
		io.Copy(io.Discard, io.LimitReader(prResp.Body, 1<<20)) //nolint:errcheck // best-effort drain
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub PR creation failed with status %d", prResp.StatusCode)})
	}
	var prData map[string]interface{}
	if err := json.NewDecoder(prResp.Body).Decode(&prData); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to decode PR response"})
	}
	prHTMLURL, _ := prData["html_url"].(string)
	if prHTMLURL == "" {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub PR response missing html_url"})
	}

	// #9890: persist audit entry after successful external PR creation.
	audit.Log(c, audit.ActionShareMissionGitHub, "mission", req.FilePath,
		fmt.Sprintf("repo=%s branch=%s fork=%s pr=%s", req.Repo, req.Branch, forkFullName, prHTMLURL))

	return c.JSON(fiber.Map{
		"success": true,
		"pr_url":  prHTMLURL,
		"fork":    forkFullName,
	})
}
