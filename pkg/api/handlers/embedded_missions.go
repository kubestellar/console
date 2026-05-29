package handlers

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/gofiber/fiber/v2"
)

const embeddedKBRoot = "embedded_kb"

//go:embed embedded_kb
var embeddedKB embed.FS

func embeddedKBPath(repoPath string) string {
	if repoPath == "" {
		return embeddedKBRoot
	}
	return path.Join(embeddedKBRoot, repoPath)
}

func embeddedHiddenMissionEntry(name string) bool {
	if strings.HasPrefix(name, ".") {
		return true
	}
	return name == "index.json" || name == "search-state.json"
}

func (h *MissionsHandler) embeddedMissionFile(repoPath string) (*githubFetchResult, bool) {
	body, err := embeddedKB.ReadFile(embeddedKBPath(repoPath))
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
	embeddedPath := embeddedKBPath(repoPath)
	info, err := fs.Stat(embeddedKB, embeddedPath)
	if err != nil {
		return nil, false
	}

	entries := make([]fiber.Map, 0)
	if info.IsDir() {
		dirEntries, err := fs.ReadDir(embeddedKB, embeddedPath)
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
