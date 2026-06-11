package handlers

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/kb"
)

func embeddedHiddenMissionEntry(name string) bool {
	if strings.HasPrefix(name, ".") {
		return true
	}
	return name == "index.json" || name == "search-state.json"
}

func (h *MissionsHandler) embeddedMissionFile(repoPath string) (*githubFetchResult, bool) {
	body, err := kb.ReadFile(repoPath)
	if err != nil {
		return nil, false
	}
	return &githubFetchResult{
		Body:        body,
		StatusCode:  http.StatusOK,
		ContentType: "text/plain",
		CacheStatus: cacheStatusEmbedded,
	}, true
}

func (h *MissionsHandler) embeddedBrowse(repoPath string) (*githubFetchResult, bool) {
	info, err := kb.Stat(repoPath)
	if err != nil {
		return nil, false
	}

	entries := make([]fiber.Map, 0)
	if info.IsDir() {
		dirEntries, err := kb.ReadDir(repoPath)
		if err != nil {
			return nil, false
		}
		entries = make([]fiber.Map, 0, len(dirEntries))
		for _, entry := range dirEntries {
			name := entry.Name()
			if embeddedHiddenMissionEntry(name) {
				continue
			}
			entryType := "file"
			size := 0
			if entry.IsDir() {
				entryType = "directory"
			} else if fileInfo, err := entry.Info(); err == nil {
				size = int(fileInfo.Size())
			}
			entryPath := name
			if repoPath != "" {
				entryPath = path.Join(repoPath, name)
			}
			entries = append(entries, fiber.Map{
				"name": name,
				"path": entryPath,
				"type": entryType,
				"size": size,
			})
		}
	} else {
		name := path.Base(repoPath)
		if embeddedHiddenMissionEntry(name) {
			return nil, false
		}
		entries = append(entries, fiber.Map{
			"name": name,
			"path": repoPath,
			"type": "file",
			"size": int(info.Size()),
		})
	}

	body, err := json.Marshal(entries)
	if err != nil {
		return nil, false
	}
	return &githubFetchResult{
		Body:        body,
		StatusCode:  http.StatusOK,
		ContentType: "application/json",
		CacheStatus: cacheStatusEmbedded,
	}, true
}
