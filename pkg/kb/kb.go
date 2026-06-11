package kb

import (
	"embed"
	"io/fs"
	"path"
)

const dataRoot = "data"

//go:embed data
var embeddedData embed.FS

// ReadFile reads a file from the embedded knowledge base at the given path.
func ReadFile(repoPath string) ([]byte, error) {
	return embeddedData.ReadFile(dataPath(repoPath))
}

// Stat returns file info for the given path in the embedded knowledge base.
func Stat(repoPath string) (fs.FileInfo, error) {
	return fs.Stat(embeddedData, dataPath(repoPath))
}

// ReadDir reads a directory from the embedded knowledge base at the given path.
func ReadDir(repoPath string) ([]fs.DirEntry, error) {
	return fs.ReadDir(embeddedData, dataPath(repoPath))
}

func dataPath(repoPath string) string {
	if repoPath == "" {
		return dataRoot
	}
	return path.Join(dataRoot, repoPath)
}
