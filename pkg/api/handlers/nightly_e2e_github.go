package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

// imageRe matches direct image references: ghcr.io/llm-d/<name>:<tag>
// imageRe matches direct image references: ghcr.io/llm-d/<name>:<tag>.
// (?m) enables per-line ^/$ so FindAllStringSubmatch anchors each match to
// a complete line, preventing partial-substring bypass across line boundaries
// (go/regex/missing-regexp-anchor).
var imageRe = regexp.MustCompile(`(?m)^.*ghcr\.io/llm-d/([\w][\w.-]*?):([\w][\w.+-]*).*$`)

// hubRe, nameRe, tagRe are applied to individual YAML lines via MatchString /
// FindStringSubmatch.  ^ and $ anchor each to the full line it is called on,
// preventing partial-line false positives (go/regex/missing-regexp-anchor).
var hubRe = regexp.MustCompile(`(?i)^.*hub:\s*ghcr\.io/llm-d\b.*$`)
var nameRe = regexp.MustCompile(`(?i)^.*name:\s*([\w][\w.-]*).*$`)
var tagRe = regexp.MustCompile(`(?i)^.*tag:\s*([\w][\w.+-]*).*$`)

func (h *NightlyE2EHandler) fetchWorkflowRuns(wf NightlyWorkflow) ([]NightlyRun, error) {
	url := fmt.Sprintf("%s/repos/%s/actions/workflows/%s/runs?per_page=%d",
		resolveGitHubAPIBase(), wf.Repo, wf.WorkflowFile, nightlyRunsPerPage)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// Workflow doesn't exist yet — return empty
		return []NightlyRun{}, nil
	}
	if resp.StatusCode != http.StatusOK {
		// #7055 — Use LimitReader to prevent unbounded memory on large error pages.
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxErrorBodyBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var data struct {
		WorkflowRuns []struct {
			ID         int64   `json:"id"`
			Status     string  `json:"status"`
			Conclusion *string `json:"conclusion"`
			CreatedAt  string  `json:"created_at"`
			UpdatedAt  string  `json:"updated_at"`
			HTMLURL    string  `json:"html_url"`
			RunNumber  int     `json:"run_number"`
			Event      string  `json:"event"`
		} `json:"workflow_runs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	runs := make([]NightlyRun, 0, len(data.WorkflowRuns))
	for _, r := range data.WorkflowRuns {
		// Skip runs that are still queued (never started executing)
		if r.Status == "queued" {
			continue
		}
		runs = append(runs, NightlyRun{
			ID:         r.ID,
			Status:     r.Status,
			Conclusion: r.Conclusion,
			CreatedAt:  r.CreatedAt,
			UpdatedAt:  r.UpdatedAt,
			HTMLURL:    r.HTMLURL,
			RunNumber:  r.RunNumber,
			Model:      wf.Model,
			GPUType:    wf.GPUType,
			GPUCount:   wf.GPUCount,
			Event:      r.Event,
		})
	}

	// Classify failures (GPU unavailable vs test failure)
	h.classifyFailures(wf.Repo, runs)

	return runs, nil
}

// maxConcurrentClassify limits concurrent detectGPUFailure calls to prevent
// unbounded goroutine fan-out when many runs fail simultaneously (#7056).
const maxConcurrentClassify = 5

// classifyFailures fetches jobs for failed runs and sets FailureReason.
// #7056 — Uses a semaphore to cap concurrent GitHub API calls.
func (h *NightlyE2EHandler) classifyFailures(repo string, runs []NightlyRun) {
	var wg sync.WaitGroup
	sem := make(chan struct{}, maxConcurrentClassify)
	for i := range runs {
		if runs[i].Conclusion == nil || *runs[i].Conclusion != "failure" {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		idx := i
		safego.Go(func() {
			defer wg.Done()
			defer func() { <-sem }()
			runs[idx].FailureReason = h.detectGPUFailure(repo, runs[idx].ID)
		})
	}
	wg.Wait()
}

// detectGPUFailure checks if a run failed due to GPU unavailability.
func (h *NightlyE2EHandler) detectGPUFailure(repo string, runID int64) string {
	url := fmt.Sprintf("%s/repos/%s/actions/runs/%d/jobs?per_page=30",
		resolveGitHubAPIBase(), repo, runID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return failureReasonTest
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return failureReasonTest
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return failureReasonTest
	}

	var jobData struct {
		Jobs []struct {
			Conclusion *string `json:"conclusion"`
			Steps      []struct {
				Name       string  `json:"name"`
				Conclusion *string `json:"conclusion"`
			} `json:"steps"`
		} `json:"jobs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&jobData); err != nil {
		return failureReasonTest
	}

	for _, job := range jobData.Jobs {
		for _, step := range job.Steps {
			if step.Conclusion != nil && *step.Conclusion == "failure" &&
				isGPUStep(step.Name) {
				return failureReasonGPU
			}
		}
	}
	return failureReasonTest
}

// ---------------------------------------------------------------------------
// Dynamic image tag fetching from guide YAML files
// ---------------------------------------------------------------------------

// fetchAllGuideImages fetches image tags for all unique guide paths by scanning
// YAML files in the llm-d/llm-d repo's guides/ directory via the Git Trees API.
func (h *NightlyE2EHandler) fetchAllGuideImages() map[string]map[string]string {
	result := make(map[string]map[string]string)

	// Collect unique guide paths
	seen := make(map[string]bool)
	guidePaths := make([]string, 0, len(nightlyWorkflows))
	for _, wf := range nightlyWorkflows {
		if wf.GuidePath != "" && !seen[wf.GuidePath] {
			seen[wf.GuidePath] = true
			guidePaths = append(guidePaths, wf.GuidePath)
		}
	}

	// Fetch the repo tree once (single API call for all file paths)
	yamlFiles := h.fetchGuideYAMLFiles()

	// For each guide, find relevant files and fetch their contents in parallel
	type guideResult struct {
		path   string
		images map[string]string
	}
	ch := make(chan guideResult, len(guidePaths))

	for _, gp := range guidePaths {
		safego.GoWith("nightly-e2e-fetch-guide-images", func() {
			prefix := "guides/" + gp + "/"
			images := make(map[string]string)

			// Find YAML files under this guide's directory
			files := make([]treeEntry, 0, len(yamlFiles)/4)
			for _, f := range yamlFiles {
				if strings.HasPrefix(f.Path, prefix) {
					files = append(files, f)
				}
			}

			// Fetch each file and parse images (sequentially per guide to limit API calls)
			for _, f := range files {
				content := h.fetchBlob(f.SHA)
				if content == "" {
					continue
				}
				for k, v := range parseImagesFromYAML(content) {
					images[k] = v
				}
			}

			ch <- guideResult{path: gp, images: images}
		})
	}

	for range guidePaths {
		gr := <-ch
		if len(gr.images) > 0 {
			result[gr.path] = gr.images
		}
	}

	return result
}

// treeEntry holds a file path and its blob SHA from the Git Trees API.
type treeEntry struct {
	Path string
	SHA  string
}

// fetchGuideYAMLFiles fetches the repo tree and returns YAML files under guides/
// that are likely to contain image references (values.yaml, decode.yaml, etc.).
func (h *NightlyE2EHandler) fetchGuideYAMLFiles() []treeEntry {
	url := fmt.Sprintf("%s/repos/%s/git/trees/main?recursive=1", resolveGitHubAPIBase(), imageRepo)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil
	}

	var tree struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
			SHA  string `json:"sha"`
		} `json:"tree"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tree); err != nil {
		return nil
	}

	results := make([]treeEntry, 0, len(tree.Tree)/4)
	for _, entry := range tree.Tree {
		if entry.Type != "blob" {
			continue
		}
		if !strings.HasPrefix(entry.Path, "guides/") {
			continue
		}
		if !strings.HasSuffix(entry.Path, ".yaml") {
			continue
		}
		// Only scan files likely to contain image references
		name := entry.Path[strings.LastIndex(entry.Path, "/")+1:]
		if name == "values.yaml" || name == "decode.yaml" || name == "prefill.yaml" ||
			strings.Contains(name, "inferencepool") {
			results = append(results, treeEntry{Path: entry.Path, SHA: entry.SHA})
		}
	}

	return results
}

// fetchBlob fetches a git blob's content by SHA and returns it decoded.
func (h *NightlyE2EHandler) fetchBlob(sha string) string {
	url := fmt.Sprintf("%s/repos/%s/git/blobs/%s", resolveGitHubAPIBase(), imageRepo, sha)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	var blob struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&blob); err != nil {
		return ""
	}

	if blob.Encoding == "base64" {
		decoded, err := base64.StdEncoding.DecodeString(blob.Content)
		if err != nil {
			return ""
		}
		return string(decoded)
	}

	return blob.Content
}

// parseImagesFromYAML extracts ghcr.io/llm-d image references from YAML content.
// Handles two patterns:
//  1. Direct: image: ghcr.io/llm-d/<name>:<tag>
//  2. Hub/name/tag (EPP): hub: ghcr.io/llm-d + name: <name> + tag: <tag>
func parseImagesFromYAML(content string) map[string]string {
	images := make(map[string]string)

	// Pattern 1: direct image references
	for _, match := range imageRe.FindAllStringSubmatch(content, -1) {
		// Skip commented-out YAML lines
		line := match[0]
		if strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		images[match[1]] = match[2]
	}

	// Pattern 2: hub/name/tag (EPP images)
	// Scan lines for "hub: ghcr.io/llm-d" and look for nearby name/tag
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		if !hubRe.MatchString(line) {
			continue
		}
		// Search nearby lines (±5) for name and tag
		const searchRadius = 5
		var name, tag string
		start := i - searchRadius
		if start < 0 {
			start = 0
		}
		end := i + searchRadius
		if end >= len(lines) {
			end = len(lines) - 1
		}
		for j := start; j <= end; j++ {
			trimmed := strings.TrimSpace(lines[j])
			// Skip commented-out lines
			if strings.HasPrefix(trimmed, "#") {
				continue
			}
			if m := nameRe.FindStringSubmatch(lines[j]); m != nil && name == "" {
				name = m[1]
			}
			if m := tagRe.FindStringSubmatch(lines[j]); m != nil && tag == "" {
				tag = m[1]
			}
		}
		if name != "" && tag != "" {
			images[name] = tag
		}
	}

	return images
}

// isGPUStep returns true if the step name indicates a GPU availability check.
func isGPUStep(name string) bool {
	lower := strings.ToLower(name)
	return strings.Contains(lower, "gpu") && strings.Contains(lower, "availab")
}

// fetchJobLog fetches the plain-text log for a single GitHub Actions job,
// truncated to the last maxLogBytes bytes (failure info is at the tail).
func (h *NightlyE2EHandler) fetchJobLog(repo string, jobID int64) string {
	logURL := fmt.Sprintf("%s/repos/%s/actions/jobs/%d/logs", resolveGitHubAPIBase(), repo, jobID)

	req, err := http.NewRequest("GET", logURL, nil)
	if err != nil {
		slog.Error("failed to create log request", "repo", repo, "jobID", jobID, "error", err)
		return "[error creating request]"
	}
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	// Don't follow redirects automatically — GitHub returns 302 to a signed URL
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		slog.Error("failed to fetch log", "repo", repo, "jobID", jobID, "error", err)
		return "[error fetching log]"
	}
	defer resp.Body.Close()

	// Follow the redirect manually
	if resp.StatusCode == http.StatusFound {
		location := resp.Header.Get("Location")
		if location == "" {
			return "[redirect with no Location header]"
		}
		redirectReq, err := http.NewRequest("GET", location, nil)
		if err != nil {
			slog.Error("failed to create redirect request", "repo", repo, "jobID", jobID, "location", location, "error", err)
			return "[error following redirect]"
		}
		redirectResp, err := h.httpClient.Do(redirectReq)
		if err != nil {
			slog.Error("failed to fetch redirected log", "repo", repo, "jobID", jobID, "error", err)
			return "[error fetching redirected log]"
		}
		defer redirectResp.Body.Close()
		return readTruncatedLog(redirectResp.Body)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Sprintf("[GitHub returned %d for job logs]", resp.StatusCode)
	}

	return readTruncatedLog(resp.Body)
}

// readTruncatedLog reads a log body and returns the last maxLogBytes bytes.
func readTruncatedLog(body io.Reader) string {
	data, err := io.ReadAll(io.LimitReader(body, int64(maxLogBytes*2)))
	if err != nil {
		slog.Error("failed to read log body", "error", err)
		return "[error reading log]"
	}
	if len(data) > maxLogBytes {
		// Take the tail — failure info is at the end
		data = data[len(data)-maxLogBytes:]
		return "...[truncated]\n" + string(data)
	}
	return string(data)
}
