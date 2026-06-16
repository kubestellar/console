package missions

import (
	"encoding/json"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEmbeddedHiddenMissionEntry(t *testing.T) {
	tests := []struct {
		name     string
		entry    string
		expected bool
	}{
		{
			name:     "hidden - dot prefix",
			entry:    ".hidden",
			expected: true,
		},
		{
			name:     "hidden - .git directory",
			entry:    ".git",
			expected: true,
		},
		{
			name:     "hidden - index.json",
			entry:    "index.json",
			expected: true,
		},
		{
			name:     "hidden - search-state.json",
			entry:    "search-state.json",
			expected: true,
		},
		{
			name:     "visible - regular file",
			entry:    "mission.yaml",
			expected: false,
		},
		{
			name:     "visible - subdirectory",
			entry:    "fixes",
			expected: false,
		},
		{
			name:     "visible - empty string",
			entry:    "",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := embeddedHiddenMissionEntry(tt.entry)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestEmbeddedMissionFile(t *testing.T) {
	tests := []struct {
		name         string
		repoPath     string
		expectFound  bool
		expectedCode int
	}{
		{
			name:        "non-existent file",
			repoPath:    "nonexistent/file.yaml",
			expectFound: false,
		},
		{
			name:        "empty path",
			repoPath:    "",
			expectFound: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := NewMissionsHandler()
			result, found := handler.embeddedMissionFile(tt.repoPath)

			if tt.expectFound {
				require.True(t, found, "expected file to be found")
				require.NotNil(t, result)
				assert.Equal(t, tt.expectedCode, result.StatusCode)
				assert.Equal(t, "text/plain", result.ContentType)
				assert.Equal(t, cacheStatusEmbedded, result.CacheStatus)
				assert.NotEmpty(t, result.Body)
			} else {
				assert.False(t, found, "expected file not to be found")
				assert.Nil(t, result)
			}
		})
	}
}

func TestEmbeddedBrowse(t *testing.T) {
	tests := []struct {
		name         string
		repoPath     string
		expectFound  bool
		expectedCode int
		checkEntries func(t *testing.T, entries []fiber.Map)
	}{
		{
			name:         "browse root directory",
			repoPath:     "",
			expectFound:  true,
			expectedCode: 200,
			checkEntries: func(t *testing.T, entries []fiber.Map) {
				require.NotEmpty(t, entries, "root should have entries")
				// Should not include hidden files like .git or index.json
				for _, entry := range entries {
					name := entry["name"].(string)
					assert.False(t, embeddedHiddenMissionEntry(name), "should not include hidden entry: %s", name)
				}
			},
		},
		{
			name:        "non-existent path",
			repoPath:    "nonexistent/path",
			expectFound: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := NewMissionsHandler()
			result, found := handler.embeddedBrowse(tt.repoPath)

			if tt.expectFound {
				require.True(t, found, "expected path to be found")
				require.NotNil(t, result)
				assert.Equal(t, tt.expectedCode, result.StatusCode)
				assert.Equal(t, "application/json", result.ContentType)
				assert.Equal(t, cacheStatusEmbedded, result.CacheStatus)
				
				var entries []fiber.Map
				err := json.Unmarshal(result.Body, &entries)
				require.NoError(t, err)
				
				if tt.checkEntries != nil {
					tt.checkEntries(t, entries)
				}
			} else {
				assert.False(t, found, "expected path not to be found")
				assert.Nil(t, result)
			}
		})
	}
}

func TestEmbeddedBrowse_SingleFile(t *testing.T) {
	handler := NewMissionsHandler()
	result, found := handler.embeddedBrowse("fixes/index.json")
	
	// index.json is a hidden file, should not be returned
	assert.False(t, found)
	assert.Nil(t, result)
}
