package feedback

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
)

func (h *FeedbackHandler) linkIssueAsSubIssue(ctx context.Context, repoOwner, repoName string, parentIssueNumber int, subIssueID int64, authToken string) error {
	payload := map[string]interface{}{
		"sub_issue_id": subIssueID,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal sub-issue payload: %w", err)
	}

	apiURL := fmt.Sprintf("%s/repos/%s/%s/issues/%d/sub_issues", resolveGitHubAPIBase(), repoOwner, repoName, parentIssueNumber)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+authToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2026-03-10")
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if readErr != nil {
			respBody = []byte("(failed to read response body)")
		}
		return fmt.Errorf("GitHub sub-issue API returned %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (h *FeedbackHandler) canLinkParentIssue(ctx context.Context, repoOwner, repoName, clientAuth string) (bool, error) {
	if clientAuth == "" {
		return false, nil
	}
	if h.attributionProxyURL != "" {
		canLinkParent, err := h.fetchIssueLinkCapabilitiesViaProxy(ctx, repoOwner, repoName, clientAuth)
		if err == nil {
			return canLinkParent, nil
		}
		slog.Warn("[Feedback] issue link capability proxy failed, falling back to GitHub", "error", err)
	}
	return h.fetchIssueLinkCapabilitiesDirect(ctx, repoOwner, repoName, clientAuth)
}

func (h *FeedbackHandler) fetchIssueLinkCapabilitiesViaProxy(ctx context.Context, repoOwner, repoName, clientAuth string) (bool, error) {
	proxyURL := fmt.Sprintf("%s?mode=capabilities&repoOwner=%s&repoName=%s", h.attributionProxyURL, repoOwner, repoName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, proxyURL, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("X-KC-Client-Auth", clientAuth)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		return false, fmt.Errorf("proxy returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		CanLinkParent bool `json:"can_link_parent"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, err
	}
	return result.CanLinkParent, nil
}

func (h *FeedbackHandler) fetchIssueLinkCapabilitiesDirect(ctx context.Context, repoOwner, repoName, clientAuth string) (bool, error) {
	apiURL := fmt.Sprintf("%s/repos/%s/%s", resolveGitHubAPIBase(), repoOwner, repoName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+clientAuth)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2026-03-10")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		return false, fmt.Errorf("GitHub repo permissions API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Permissions struct {
			Push bool `json:"push"`
		} `json:"permissions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, err
	}
	return result.Permissions.Push, nil
}
