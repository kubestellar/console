//go:build unix

package updater

import (
	"os"
	"syscall"
)

func statDevPlatform(path string) (uint64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, os.ErrInvalid
	}
	return uint64(st.Dev), nil
}
