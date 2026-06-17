package handlers

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestStopWatcher(t *testing.T) {
	t.Run("stop watcher when watcher is nil", func(t *testing.T) {
		h := &ConsolePersistenceHandlers{}
		assert.NotPanics(t, func() {
			h.StopWatcher()
		})
	})

	t.Run("stop watcher sets watcher to nil", func(t *testing.T) {
		h := &ConsolePersistenceHandlers{}
		h.watcher = nil
		h.StopWatcher()
		assert.Nil(t, h.watcher)
	})
}
