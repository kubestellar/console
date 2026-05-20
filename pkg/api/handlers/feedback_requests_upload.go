package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
)

type screenshotUploadResult struct {
	Uploaded int `json:"screenshots_uploaded"`
	Failed   int `json:"screenshots_failed"`
}

const maxAgentConnectionLogLines = 10

func (h *FeedbackHandler) uploadScreenshotCommentsAsync(ctx context.Context, issueNumber int, repoOwner, repoName, requestID string, screenshots []string) {
	if len(screenshots) == 0 {
		return
	}
	slog.Info("[Feedback] async screenshot processing queued",
		"issue", issueNumber, "repo", repoOwner+"/"+repoName, "request_id", requestID, "count", len(screenshots))
	var uploaded, failed int
	for i, dataURI := range screenshots {
		if ctx.Err() != nil {
			// Timeout or cancellation — count the rest as failed and stop.
			failed += len(screenshots) - i
			slog.Warn("[Feedback] async screenshot upload context done, remaining screenshots skipped",
				"issue", issueNumber, "remaining", len(screenshots)-i, "reason", ctx.Err())
			break
		}

		// Post a base64 marker comment that process-screenshots.yml
		// transforms into a rendered image using workflow credentials.
		commentBody := formatScreenshotProcessingComment(i+1, dataURI)
		if commentErr := h.addIssueComment(ctx, issueNumber, commentBody, repoName); commentErr != nil {
			slog.Warn("[Feedback] async screenshot comment upload failed",
				"index", i+1, "issue", issueNumber, "error", commentErr)
			failed++
			continue
		}
		uploaded++
	}
	slog.Info("[Feedback] async screenshot upload complete",
		"issue", issueNumber, "uploaded", uploaded, "failed", failed)
}

func formatScreenshotProcessingComment(index int, dataURI string) string {
	return fmt.Sprintf("<!-- screenshot-base64:%d -->\n<details>\n<summary>Screenshot %d (processing...)</summary>\n\n```\n%s\n```\n\n</details>", index, index, dataURI)
}

func (h *FeedbackHandler) uploadScreenshotToGitHub(repoOwner, repoName, requestID string, index int, dataURI string) (string, error) {
	// Parse data URI: "data:image/png;base64,iVBOR..."
	parts := strings.SplitN(dataURI, ",", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid data URI format")
	}

	// Extract MIME type to determine file extension
	ext := "png" // default
	header := parts[0]
	if strings.Contains(header, "image/jpeg") || strings.Contains(header, "image/jpg") {
		ext = "jpg"
	} else if strings.Contains(header, "image/gif") {
		ext = "gif"
	} else if strings.Contains(header, "image/webp") {
		ext = "webp"
	}

	// The base64 content (GitHub Contents API expects raw base64, no wrapping).
	// Browsers may omit trailing '=' padding, so we normalize first.
	b64Content := parts[1]

	// Add padding if missing — base64 requires length to be a multiple of 4
	if remainder := len(b64Content) % 4; remainder != 0 {
		b64Content += strings.Repeat("=", 4-remainder)
	}

	// Validate that the base64 content is actually valid
	if _, err := base64.StdEncoding.DecodeString(b64Content); err != nil {
		return "", fmt.Errorf("invalid base64 content: %w", err)
	}

	filePath := fmt.Sprintf(".github/screenshots/%s/screenshot-%d.%s", requestID, index+1, ext)

	payload := map[string]string{
		"message": fmt.Sprintf("Add screenshot %d for issue %s", index+1, requestID),
		"content": b64Content,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal upload payload: %w", err)
	}

	apiURL := fmt.Sprintf("%s/repos/%s/%s/contents/%s", resolveGitHubAPIBase(), repoOwner, repoName, filePath)

	// Use a per-request timeout for screenshot uploads (large base64 payloads)
	// instead of creating a separate http.Client, to reuse h.httpClient's
	// Transport (connection pooling, proxy settings, keep-alive tuning).
	ctx, cancel := context.WithTimeout(context.Background(), screenshotUploadTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "PUT", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if err != nil {
			slog.Warn("failed to read response body", "error", err)
		}
		return "", fmt.Errorf("GitHub Contents API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Content struct {
			DownloadURL string `json:"download_url"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode upload response: %w", err)
	}

	return result.Content.DownloadURL, nil
}
