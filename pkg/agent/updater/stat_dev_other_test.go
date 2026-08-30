//go:build !unix

package updater

import "os"

func statDevPlatform(path string) (uint64, error) {
	// On non-unix platforms (e.g. Windows), rely on the fallback path in
	// probeCrossDevice: this returns 0 for all inputs, so the caller will
	// treat both candidate filesystems as identical and t.Skip.
	if _, err := os.Stat(path); err != nil {
		return 0, err
	}
	return 0, nil
}
