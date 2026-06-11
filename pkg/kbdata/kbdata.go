// Package kbdata provides embedded knowledge-base content for the missions
// feature. It is extracted into its own package so the 3.8 MB / 275-file
// corpus can be versioned, cached, and compiled independently of the
// handlers package.
package kbdata

import (
	"embed"
	"io/fs"
	"path"
)

const root = "embedded_kb"

//go:embed embedded_kb
var content embed.FS

// FS returns the embedded filesystem rooted at the embedded_kb directory.
// Callers use standard fs.FS operations (ReadFile, ReadDir, Stat) on the
// returned filesystem.
func FS() fs.FS {
	sub, err := fs.Sub(content, root)
	if err != nil {
		panic("kbdata: embedded_kb sub-filesystem: " + err.Error())
	}
	return sub
}

// ReadFile reads a file from the embedded KB at the given relative path.
func ReadFile(repoPath string) ([]byte, error) {
	return content.ReadFile(path.Join(root, repoPath))
}

// Stat returns file info for the given relative path in the embedded KB.
func Stat(repoPath string) (fs.FileInfo, error) {
	return fs.Stat(content, path.Join(root, repoPath))
}

// ReadDir reads a directory from the embedded KB at the given relative path.
func ReadDir(repoPath string) ([]fs.DirEntry, error) {
	return fs.ReadDir(content, path.Join(root, repoPath))
}
