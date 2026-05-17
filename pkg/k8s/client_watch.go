package k8s

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/kubestellar/console/pkg/safego"
)

// StartWatching starts watching the kubeconfig file for changes.
// Uses fsnotify for instant detection plus a polling fallback every 5s
// to catch changes that fsnotify misses (common on macOS after atomic writes).
//
// issue 6470 — Idempotent. Repeated calls return nil without spawning a
// second watcher goroutine. Previously every call created a fresh
// fsnotify.Watcher and watchLoop goroutine, orphaning the previous one.
func (m *MultiClusterClient) StartWatching() error {
	// PR #6518 item A + #6573 item A — hold the lock for the ENTIRE setup,
	// not just the check-and-set. Previous impl set watching=true, released
	// the lock, then did fsnotify.NewWatcher()+Add. A second caller arriving
	// during that window saw watching=true and returned nil immediately —
	// but the first caller's watcher might still fail setup, leaving the
	// struct in a broken state after the second caller already declared
	// success. Holding the lock across fsnotify setup is acceptable because
	// setup is fast (microseconds) and StartWatching is only called at
	// startup / after a Stop, not on any hot path.
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.watching {
		slog.Info("kubeconfig watcher already running, skipping StartWatching")
		return nil
	}
	if m.kubeconfig == "" {
		return ErrNoClusterConfigured
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("failed to create watcher: %w", err)
	}

	watchDir, err := existingWatchDir(m.kubeconfig)
	if err != nil {
		watcher.Close()
		return fmt.Errorf("failed to find kubeconfig watch directory: %w", err)
	}

	// Watch the kubeconfig file when it already exists. If it doesn't, rely on
	// the nearest existing parent directory so fresh installs can create
	// ~/.kube/config later without a restart.
	if _, statErr := os.Stat(m.kubeconfig); statErr == nil {
		if err := watcher.Add(m.kubeconfig); err != nil {
			watcher.Close()
			return fmt.Errorf("failed to watch kubeconfig: %w", err)
		}
	} else if !os.IsNotExist(statErr) {
		watcher.Close()
		return fmt.Errorf("failed to stat kubeconfig: %w", statErr)
	}

	if err := watcher.Add(watchDir); err != nil {
		watcher.Close()
		return fmt.Errorf("failed to watch kubeconfig directory: %w", err)
	}

	m.watcher = watcher
	// issue 6472 — Recreate stopWatch and reset the once on every Start so
	// Stop→Start sequences actually work. Previously Start only initialized
	// stopWatch on first call; after StopWatching closed it, a second Start
	// succeeded but watchLoop exited immediately because stopWatch was closed.
	m.stopWatch = make(chan struct{})
	m.stopWatchOnce = sync.Once{}
	// Snapshot for the goroutine so it reads a stable value even if a
	// concurrent Stop+Start rotates m.stopWatch.
	stopCh := m.stopWatch
	w := m.watcher
	// Only flip watching=true after setup has fully succeeded. A concurrent
	// caller arriving before this line sees watching=false and will block
	// on m.mu until we return; by then setup is complete (or rolled back
	// via the error path, leaving watching=false for a clean retry).
	m.watching = true

	safego.GoWith("kubeconfig/watch-loop", func() { m.watchLoop(stopCh, w) })
	slog.Info("watching kubeconfig for changes", "path", m.kubeconfig, "watchDir", watchDir)
	return nil
}

// reloadAndNotify reloads the kubeconfig and notifies listeners.
// After a successful reload, it re-adds the file to the watcher to handle
// inode changes from atomic writes (old inode watch becomes stale).
func (m *MultiClusterClient) reloadAndNotify() {
	slog.Info("Kubeconfig changed, reloading...")
	if err := m.LoadConfig(); err != nil {
		if errors.Is(err, ErrNoClusterConfigured) {
			slog.Warn("kubeconfig unavailable; entering no-cluster state", "path", m.kubeconfig)
		} else {
			slog.Error("error reloading kubeconfig", "error", err)
		}
		m.mu.RLock()
		errCallback := m.onWatchError
		m.mu.RUnlock()
		if errCallback != nil {
			errCallback(err)
		}
		return
	}
	slog.Info("Kubeconfig reloaded successfully")

	// PR #6518 item H — Re-add file watch under the lock. This runs from
	// a debounce timer on a separate goroutine; without locking it races
	// with StartWatching / StopWatching which mutate m.watcher. We also
	// check m.watching so a Stop-then-timer-fires sequence doesn't touch
	// a closed watcher.
	m.mu.Lock()
	if m.watching && m.watcher != nil {
		// #6692 — Log Remove errors (previously discarded with `_ =`).
		// fsnotify returns a "can't remove non-existent watcher" error
		// when the old inode has already been garbage-collected, which
		// is benign; any other error (EACCES, ENOSPC, …) indicates a
		// stale inode watch that will silently persist unless we notice.
		if removeErr := m.watcher.Remove(m.kubeconfig); removeErr != nil {
			// fsnotify doesn't expose typed errors; match on text.
			errText := removeErr.Error()
			isBenign := strings.Contains(errText, "non-existent") ||
				strings.Contains(errText, "not found") ||
				strings.Contains(errText, "can't remove")
			if isBenign {
				slog.Debug("fsnotify Remove returned benign 'not found'",
					"path", m.kubeconfig, "error", removeErr)
			} else {
				slog.Warn("fsnotify Remove failed; stale inode watch may persist — will attempt Add anyway",
					"path", m.kubeconfig, "error", removeErr)
			}
		}
		if err := m.watcher.Add(m.kubeconfig); err != nil {
			slog.Warn("could not re-watch kubeconfig file", "error", err)
		}
	}
	m.mu.Unlock()

	// Notify listeners
	m.mu.RLock()
	callback := m.onReload
	m.mu.RUnlock()
	if callback != nil {
		callback()
	}
}

// watchLoop runs until stopCh is closed. stopCh and watcher are passed in
// rather than read from m.stopWatch / m.watcher so a concurrent Stop→Start
// that rotates those fields does not race with this goroutine.
func (m *MultiClusterClient) watchLoop(stopCh <-chan struct{}, watcher *fsnotify.Watcher) {
	// Debounce timer to avoid reloading multiple times for rapid changes
	var debounceTimer *time.Timer
	debounceDelay := clusterEventDebounce

	// Polling fallback: check file mtime every 5s to catch changes fsnotify misses.
	// macOS kqueue can silently lose watches after atomic file replacements.
	pollTicker := time.NewTicker(clusterEventPollInterval)
	defer pollTicker.Stop()
	var lastModTime time.Time
	if info, err := os.Stat(m.kubeconfig); err == nil {
		lastModTime = info.ModTime()
	}

	triggerReload := func() {
		if debounceTimer != nil {
			debounceTimer.Stop()
		}
		debounceTimer = time.AfterFunc(debounceDelay, m.reloadAndNotify)
	}

	for {
		select {
		case <-stopCh:
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			// Watch both the kubeconfig file itself and any parent directory events
			// that could create, replace, or remove it (for example when ~/.kube
			// does not exist yet on a fresh Windows install).
			if pathAffectsKubeconfig(event.Name, m.kubeconfig) {
				if event.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Rename|fsnotify.Remove) != 0 {
					// Update lastModTime so the poller doesn't double-trigger
					if info, err := os.Stat(m.kubeconfig); err == nil {
						lastModTime = info.ModTime()
					} else if os.IsNotExist(err) {
						lastModTime = time.Time{}
					}
					triggerReload()
				}
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			slog.Error("kubeconfig watcher error", "error", err)
			// issue 6471 — Fire the public error callback so callers that
			// registered SetOnWatchError() actually see channel errors.
			// Previously this log was the only signal, silently breaking
			// the documented SetOnWatchError contract.
			m.mu.RLock()
			errCallback := m.onWatchError
			m.mu.RUnlock()
			if errCallback != nil {
				errCallback(err)
			}
		case <-pollTicker.C:
			// Polling fallback: detect changes that fsnotify missed
			info, err := os.Stat(m.kubeconfig)
			if err != nil {
				continue
			}
			if info.ModTime() != lastModTime {
				lastModTime = info.ModTime()
				slog.Info("Kubeconfig change detected by poll (fsnotify missed)")
				triggerReload()
			}
		}
	}
}

// StopWatching stops watching the kubeconfig file.
//
// issue 6469 — Safe to call multiple times. Previously a second call
// panicked because `close(m.stopWatch)` fires on an already-closed channel.
// The sync.Once guards the close; the watching flag prevents double-close
// of the fsnotify watcher too.
func (m *MultiClusterClient) StopWatching() {
	// PR #6518 item B — hold the lock through once.Do so a concurrent
	// Stop→Start that replaces m.stopWatchOnce cannot race with this Do.
	// Previously we captured &m.stopWatchOnce then released the lock; a
	// concurrent StartWatching could assign a fresh sync.Once to that
	// address while this goroutine was still inside Do, producing a
	// data race on the Once's internal state.
	m.mu.Lock()
	if !m.watching {
		m.mu.Unlock()
		return
	}
	m.watching = false
	stopCh := m.stopWatch
	w := m.watcher
	if stopCh != nil {
		m.stopWatchOnce.Do(func() { close(stopCh) })
	}
	m.mu.Unlock()

	if w != nil {
		w.Close()
	}
}

func existingWatchDir(path string) (string, error) {
	if path == "" {
		return "", ErrNoClusterConfigured
	}

	watchDir := filepath.Dir(path)
	for {
		info, err := os.Stat(watchDir)
		if err == nil {
			if !info.IsDir() {
				return "", fmt.Errorf("%s is not a directory", watchDir)
			}
			return watchDir, nil
		}
		if !os.IsNotExist(err) {
			return "", err
		}
		parent := filepath.Dir(watchDir)
		if parent == watchDir {
			return "", err
		}
		watchDir = parent
	}
}

func pathAffectsKubeconfig(eventName, kubeconfig string) bool {
	if eventName == "" || kubeconfig == "" {
		return false
	}
	cleanEvent := filepath.Clean(eventName)
	cleanKubeconfig := filepath.Clean(kubeconfig)
	if cleanEvent == cleanKubeconfig {
		return true
	}
	rel, err := filepath.Rel(cleanEvent, cleanKubeconfig)
	if err == nil && rel != "." && rel != "" && !strings.HasPrefix(rel, "..") {
		return true
	}
	return filepath.Dir(cleanEvent) == filepath.Dir(cleanKubeconfig) && filepath.Base(cleanEvent) == filepath.Base(cleanKubeconfig)
}

// SetOnReload sets a callback to be called when kubeconfig is reloaded
func (m *MultiClusterClient) SetOnReload(callback func()) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onReload = callback
}

// SetOnWatchError sets a callback invoked when the kubeconfig watcher encounters
// an error (e.g., reload failure). Allows callers to monitor watcher health (#5569).
func (m *MultiClusterClient) SetOnWatchError(callback func(error)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onWatchError = callback
}

// ListClusters returns all clusters from kubeconfig
