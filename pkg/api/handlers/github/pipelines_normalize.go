package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"
)

func normalizeRunRaw(r workflowRunRaw, repo string) ghpWorkflowRun {
	prs := make([]ghpPullRequestRef, 0)
	for _, pr := range r.PullRequests {
		prs = append(prs, ghpPullRequestRef{Number: pr.Number, URL: pr.URL})
	}
	if len(prs) == 0 && r.Event == "push" && r.HeadCommit.Message != "" {
		if m := ghpPRFromCommitRe.FindStringSubmatch(r.HeadCommit.Message); len(m) > 1 {
			n, _ := strconv.Atoi(m[1])
			if n > 0 {
				prs = append(prs, ghpPullRequestRef{
					Number: n,
					URL:    fmt.Sprintf("https://github.com/%s/pull/%d", repo, n),
				})
			}
		}
	}
	return ghpWorkflowRun{
		ID:           r.ID,
		Repo:         repo,
		Name:         r.Name,
		WorkflowID:   r.WorkflowID,
		HeadBranch:   r.HeadBranch,
		Status:       r.Status,
		Conclusion:   r.Conclusion,
		Event:        r.Event,
		RunNumber:    r.RunNumber,
		HTMLURL:      r.HTMLURL,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
		PullRequests: prs,
	}
}

func ghpStreakKind(c *string) string {
	if c == nil {
		return ""
	}
	switch *c {
	case "success":
		return "success"
	case "failure", "timed_out":
		return "failure"
	}
	return ""
}

func ghpParseMatrixDays(raw string) int {
	days := ghpMatrixDefaultDays
	if raw == "" {
		return days
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return days
	}
	if n > ghpMatrixMaxDays {
		n = ghpMatrixMaxDays
	}
	return n
}

func ghpResolveRepos(repoFilter string) ([]string, error) {
	if repoFilter == "" {
		return ghpGetRepos(), nil
	}
	if !ghpIsAllowedRepo(repoFilter) {
		return nil, ghpRepoAllowlistForbidden()
	}
	return []string{repoFilter}, nil
}

func ghpLatestReleaseTag(ctx context.Context, h *GitHubPipelinesHandler, repo string) *string {
	releaseTag := ghpLatestNightlyReleaseTag(ctx, h, repo)
	tagRes, tagErr := h.ghGet(ctx, "/repos/"+repo+"/tags?per_page=10")
	if tagErr != nil {
		return releaseTag
	}
	defer tagRes.Body.Close()
	if tagRes.StatusCode != http.StatusOK {
		return releaseTag
	}
	ctx = ghpStoreRateLimitHeaders(ctx, tagRes)
	_ = ctx
	var tags []struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(tagRes.Body).Decode(&tags); err != nil {
		return releaseTag
	}
	for _, t := range tags {
		if !ghpNightlyTagRe.MatchString(t.Name) {
			continue
		}
		if releaseTag == nil || t.Name > *releaseTag {
			tag := t.Name
			releaseTag = &tag
		}
		break
	}
	return releaseTag
}

func ghpLatestNightlyReleaseTag(ctx context.Context, h *GitHubPipelinesHandler, repo string) *string {
	relRes, relErr := h.ghGet(ctx, "/repos/"+repo+"/releases?per_page="+strconv.Itoa(ghpReleaseOverfetch))
	if relErr != nil {
		return nil
	}
	defer relRes.Body.Close()
	if relRes.StatusCode != http.StatusOK {
		return nil
	}
	ctx = ghpStoreRateLimitHeaders(ctx, relRes)
	_ = ctx
	var arr []struct {
		TagName     string  `json:"tag_name"`
		PublishedAt *string `json:"published_at"`
		CreatedAt   *string `json:"created_at"`
		Draft       bool    `json:"draft"`
	}
	if err := json.NewDecoder(relRes.Body).Decode(&arr); err != nil || len(arr) == 0 {
		return nil
	}
	type candidate struct {
		tag      string
		sortTime time.Time
	}
	candidates := make([]candidate, 0, len(arr))
	for _, r := range arr {
		if !ghpNightlyTagRe.MatchString(r.TagName) {
			continue
		}
		var sortTime time.Time
		if r.PublishedAt != nil {
			if parsed, pErr := time.Parse(time.RFC3339, *r.PublishedAt); pErr == nil {
				sortTime = parsed
			}
		}
		if sortTime.IsZero() && r.CreatedAt != nil {
			if parsed, pErr := time.Parse(time.RFC3339, *r.CreatedAt); pErr == nil {
				sortTime = parsed
			}
		}
		candidates = append(candidates, candidate{tag: r.TagName, sortTime: sortTime})
	}
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].sortTime.After(candidates[j].sortTime)
	})
	if len(candidates) == 0 {
		return nil
	}
	tag := candidates[0].tag
	return &tag
}

func ghpLatestWeeklyTag(ctx context.Context, h *GitHubPipelinesHandler, repo string) *string {
	weeklyRes, weeklyErr := h.ghGet(ctx, "/repos/"+repo+"/releases/latest")
	if weeklyErr != nil {
		return nil
	}
	defer weeklyRes.Body.Close()
	if weeklyRes.StatusCode != http.StatusOK {
		return nil
	}
	ctx = ghpStoreRateLimitHeaders(ctx, weeklyRes)
	_ = ctx
	var latest struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(weeklyRes.Body).Decode(&latest); err != nil || latest.TagName == "" {
		return nil
	}
	return &latest.TagName
}

func ghpBuildPulseRecent(runs []ghpWorkflowRun) []ghpPulseRecent {
	window := runs
	if len(window) > ghpPulseWindowDays {
		window = window[:ghpPulseWindowDays]
	}
	recent := make([]ghpPulseRecent, 0, len(window))
	for _, r := range window {
		recent = append(recent, ghpPulseRecent{
			Conclusion: r.Conclusion,
			CreatedAt:  r.CreatedAt,
			HTMLURL:    r.HTMLURL,
		})
	}
	return recent
}

func ghpBuildRangeDates(days int) []string {
	rangeDates := make([]string, 0, days)
	now := time.Now().UTC()
	for i := days - 1; i >= 0; i-- {
		rangeDates = append(rangeDates, now.AddDate(0, 0, -i).Format("2006-01-02"))
	}
	return rangeDates
}

func ghpFailureDuration(r ghpWorkflowRun) int64 {
	created, _ := time.Parse(time.RFC3339, r.CreatedAt)
	updated, _ := time.Parse(time.RFC3339, r.UpdatedAt)
	dur := updated.Sub(created).Milliseconds()
	if dur < 0 {
		return 0
	}
	return dur
}

func ghpFirstFailedStep(jobs []ghpJob) *ghpFailedStep {
	for _, j := range jobs {
		if j.Conclusion == nil || *j.Conclusion != "failure" {
			continue
		}
		for _, s := range j.Steps {
			if s.Conclusion != nil && *s.Conclusion == "failure" {
				return &ghpFailedStep{JobID: j.ID, JobName: j.Name, StepName: s.Name}
			}
		}
	}
	return nil
}
