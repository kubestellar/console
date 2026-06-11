package handlers

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMissionsHandler_Constants(t *testing.T) {
	assert.Equal(t, 30, int(missionsAPITimeout.Seconds()))
	assert.Equal(t, 10*1024*1024, missionsMaxBodyBytes)
	assert.Equal(t, 512, missionsMaxPathLen)
	assert.Equal(t, 1*1024*1024, missionsGitHubShareMaxBytes)
	assert.Equal(t, 10*1024, slackMaxTextBytes)
	assert.Equal(t, 256*1024*1024, missionsCacheMaxBytes)
}

func TestMissionsHandler_AllowedShareRepoEnvVar(t *testing.T) {
	assert.Equal(t, "KC_ALLOWED_SHARE_REPOS", allowedShareRepoEnvVar)
}

func TestMissionsHandler_DefaultShareRepos(t *testing.T) {
	assert.Contains(t, missionsDefaultShareRepos, "kubestellar/console-kb")
	assert.NotEmpty(t, missionsDefaultShareRepos)
}

func TestMissionsHandler_SlackWebhookConstants(t *testing.T) {
	assert.Equal(t, "hooks.slack.com", validSlackWebhookHost)
	assert.Equal(t, "/services/", validSlackWebhookPathPrefix)
}

func TestMissionsHandler_PaginationDefaults(t *testing.T) {
	assert.Equal(t, 50, defaultScoresPageLimit)
	assert.Equal(t, 200, maxScoresPageLimit)
}

func TestMissionsHandler_CacheTTLs(t *testing.T) {
	assert.Equal(t, 10, int(missionsCacheTTL.Minutes()))
	assert.Equal(t, 60, int(missionsCacheStaleTTL.Minutes()))
}

func TestMissionsHandler_CacheLimits(t *testing.T) {
	assert.Equal(t, 256, missionsCacheMaxEntries)
	assert.Equal(t, 256*1024*1024, missionsCacheMaxBytes)
}

func TestMissionsHandler_ValidateMaxBytes(t *testing.T) {
	assert.Equal(t, 1*1024*1024, missionsValidateMaxBytes)
}

func TestIsSafeImageKey(t *testing.T) {
	tests := []struct {
		key  string
		safe bool
	}{
		{"component-a", true},
		{"valid_image", true},
		{"image123", true},
		{"__proto__", false},
		{"constructor", false},
		{"prototype", false},
	}

	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			result := isSafeImageKey(tt.key)
			assert.Equal(t, tt.safe, result)
		})
	}
}

func TestMissionSpec_Structure(t *testing.T) {
	spec := MissionSpec{
		APIVersion: "kc-mission-v1",
		Kind:       "Mission",
	}
	spec.Metadata.Name = "test-mission"
	spec.Spec.Description = "Test description"

	assert.Equal(t, "kc-mission-v1", spec.APIVersion)
	assert.Equal(t, "Mission", spec.Kind)
	assert.Equal(t, "test-mission", spec.Metadata.Name)
	assert.Equal(t, "Test description", spec.Spec.Description)
}

func TestSlackShareRequest_Structure(t *testing.T) {
	req := SlackShareRequest{
		WebhookURL: "https://hooks.slack.com/services/T/B/X",
		Text:       "Test message",
	}

	assert.Equal(t, "https://hooks.slack.com/services/T/B/X", req.WebhookURL)
	assert.Equal(t, "Test message", req.Text)
}

func TestIndexJsonFormat_Structure(t *testing.T) {
	index := indexJsonFormat{
		Version: 1,
		Count:   2,
		Missions: []struct {
			Path               string      `json:"path"`
			Title              string      `json:"title"`
			Description        string      `json:"description"`
			QualityScore       *int        `json:"qualityScore"`
			QualityPass        *bool       `json:"qualityPass"`
			TestedOn           interface{} `json:"testedOn"`
			QualityIssues      []string    `json:"qualityIssues"`
			QualitySuggestions []string    `json:"qualitySuggestions"`
			QualityBreakdown   interface{} `json:"qualityBreakdown"`
			CncfProjects       []string    `json:"cncfProjects"`
		}{
			{Path: "fixes/test.json", Title: "Test", CncfProjects: []string{"kubernetes"}},
		},
	}

	assert.Equal(t, 1, index.Version)
	assert.Equal(t, 2, index.Count)
	assert.Len(t, index.Missions, 1)
	assert.Equal(t, "fixes/test.json", index.Missions[0].Path)
}

func TestCacheStatus_Values(t *testing.T) {
	assert.Equal(t, cacheStatus("HIT"), cacheStatusHit)
	assert.Equal(t, cacheStatus("MISS"), cacheStatusMiss)
	assert.Equal(t, cacheStatus("STALE"), cacheStatusStale)
	assert.Equal(t, cacheStatus("EMBEDDED"), cacheStatusEmbedded)
}
