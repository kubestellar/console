package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/safego"
)

// orbitSuffixBytes is the number of random bytes used to generate a unique
// suffix for orbit mission IDs, producing a 4-character hex string.
const orbitSuffixBytes = 2

// orbitSuffixNanoMask masks the low 16 bits of a nanosecond timestamp so the
// crypto/rand fallback still produces a 4-char hex suffix with variable bits.
const orbitSuffixNanoMask = 0xffff

// generateOrbitSuffix returns a short random hex string for mission ID uniqueness.
func generateOrbitSuffix() string {
	b := make([]byte, orbitSuffixBytes)
	if _, err := rand.Read(b); err != nil {
		// Fallback: derive from nanosecond timestamp if crypto/rand fails.
		// time.Format("0000") would return the literal string "0000" because
		// "0" is not a reference layout token — use Sprintf to get real bits.
		return fmt.Sprintf("%04x", time.Now().UnixNano()&orbitSuffixNanoMask)
	}
	return hex.EncodeToString(b)
}

// ─── Constants ──────────────────────────────────────────────────────

// orbitScheduleCheckIntervalSec is how often (seconds) the background
// scheduler goroutine checks for due missions. The frontend also polls
// /api/orbit/schedule so this is a belt-and-suspenders approach.
const orbitScheduleCheckIntervalSec = 60

// orbitCadenceHours maps cadence names to their interval in hours.
var orbitCadenceHours = map[string]float64{
	"daily":   24,
	"weekly":  168,
	"monthly": 720,
}

// orbitDefaultDataFile is the filename used to persist orbit missions
// inside the console data directory.
const orbitDefaultDataFile = "orbit_missions.json"

// orbitMaxHistoryEntries is the maximum number of run records kept per orbit mission.
const orbitMaxHistoryEntries = 50

const orbitRunMissionNoExecutorSummary = "No executor configured — mission steps were not run"
const orbitSchedulerNoExecutorSummary = "No executor configured"

// orbitMissionExecTimeout caps a single scheduled mission execution so a
// hung executor cannot block the entire orbit scheduler goroutine.
const orbitMissionExecTimeout = 5 * time.Minute

// ─── Types ──────────────────────────────────────────────────────────

// OrbitMission represents a recurring maintenance mission.
type OrbitMission struct {
	ID            string           `json:"id"`
	Title         string           `json:"title"`
	Description   string           `json:"description"`
	OrbitType     string           `json:"orbitType"`
	Cadence       string           `json:"cadence"`
	AutoRun       bool             `json:"autoRun"`
	Clusters      []string         `json:"clusters"`
	Steps         []OrbitStep      `json:"steps"`
	LastRunAt     *string          `json:"lastRunAt"`
	LastRunResult *string          `json:"lastRunResult"`
	CreatedAt     string           `json:"createdAt"`
	History       []OrbitRunRecord `json:"history"`
}

// OrbitStep is a single step in an orbit mission template.
type OrbitStep struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

// OrbitRunRecord tracks one execution of an orbit mission.
type OrbitRunRecord struct {
	Timestamp string `json:"timestamp"`
	Result    string `json:"result"`
	Summary   string `json:"summary,omitempty"`
}

// OrbitExecutor runs mission steps for an orbit mission.
type OrbitExecutor interface {
	Execute(ctx context.Context, mission *OrbitMission) (result string, summary string, err error)
}

// OrbitScheduleEntry describes a mission that is due or upcoming.
type OrbitScheduleEntry struct {
	MissionID string `json:"missionId"`
	Title     string `json:"title"`
	OrbitType string `json:"orbitType"`
	Cadence   string `json:"cadence"`
	AutoRun   bool   `json:"autoRun"`
	IsDue     bool   `json:"isDue"`
	NextRunAt string `json:"nextRunAt"`
}

// ─── Handler ────────────────────────────────────────────────────────

// OrbitHandler manages orbit mission CRUD and schedule queries.
type OrbitHandler struct {
	mu       sync.RWMutex
	missions map[string]*OrbitMission
	dataFile string
	executor OrbitExecutor
}

// NewOrbitHandler creates an OrbitHandler, loading any persisted missions
// from disk. dataDir is the console data directory (e.g. "./data").
func NewOrbitHandler(dataDir string, executor OrbitExecutor) *OrbitHandler {
	h := &OrbitHandler{
		missions: make(map[string]*OrbitMission),
		dataFile: filepath.Join(dataDir, orbitDefaultDataFile),
		executor: executor,
	}
	h.loadFromDisk()
	return h
}

// RegisterRoutes wires all orbit endpoints onto the given router group.
func (h *OrbitHandler) RegisterRoutes(g fiber.Router) {
	g.Get("/missions", h.ListMissions)
	g.Post("/missions", h.CreateMission)
	g.Post("/missions/:id/run", h.RunMission)
	g.Get("/schedule", h.GetSchedule)
}

// ─── Endpoints ──────────────────────────────────────────────────────

// ListMissions returns all orbit missions.
// GET /api/orbit/missions
func (h *OrbitHandler) ListMissions(c *fiber.Ctx) error {
	h.mu.RLock()
	defer h.mu.RUnlock()

	out := make([]*OrbitMission, 0, len(h.missions))
	for _, m := range h.missions {
		out = append(out, m)
	}
	return c.JSON(fiber.Map{"missions": out})
}

// CreateMission saves a new orbit mission.
// POST /api/orbit/missions
func (h *OrbitHandler) CreateMission(c *fiber.Ctx) error {
	var m OrbitMission
	if err := c.BodyParser(&m); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// Validate required fields
	if m.OrbitType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "orbitType is required"})
	}
	if m.Cadence == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cadence is required"})
	}
	if _, ok := orbitCadenceHours[m.Cadence]; !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cadence must be daily, weekly, or monthly"})
	}

	if m.ID == "" {
		// Use millisecond-precision timestamp plus a random suffix to avoid
		// collisions when two missions are created in the same second (#7800).
		m.ID = "orbit-" + time.Now().Format("20060102150405.000") + "-" + generateOrbitSuffix()
	}
	if m.CreatedAt == "" {
		m.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if m.History == nil {
		m.History = []OrbitRunRecord{}
	}
	if m.Clusters == nil {
		m.Clusters = []string{}
	}

	h.mu.Lock()
	h.missions[m.ID] = &m
	h.mu.Unlock()
	h.saveToDisk()

	return c.Status(fiber.StatusCreated).JSON(m)
}

// RunMission executes an orbit mission right now.
// POST /api/orbit/missions/:id/run
func (h *OrbitHandler) RunMission(c *fiber.Ctx) error {
	id := c.Params("id")

	h.mu.RLock()
	m, ok := h.missions[id]
	if !ok {
		h.mu.RUnlock()
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "mission not found"})
	}
	mission := cloneOrbitMission(m)
	h.mu.RUnlock()

	result, summary := h.executeMission(c.Context(), mission, orbitRunMissionNoExecutorSummary)
	runAt := time.Now().UTC().Format(time.RFC3339)
	h.recordMissionRun(id, runAt, result, summary)

	return c.JSON(fiber.Map{
		"missionId": id,
		"runAt":     runAt,
		"result":    result,
		"summary":   summary,
	})
}

// GetSchedule returns which missions are due based on their cadence.
// GET /api/orbit/schedule
func (h *OrbitHandler) GetSchedule(c *fiber.Ctx) error {
	h.mu.RLock()
	defer h.mu.RUnlock()

	entries := make([]OrbitScheduleEntry, 0)
	now := time.Now().UTC()

	for _, m := range h.missions {
		cadenceHrs, ok := orbitCadenceHours[m.Cadence]
		if !ok {
			continue
		}
		cadenceDuration := time.Duration(cadenceHrs * float64(time.Hour))

		var nextRun time.Time
		var isDue bool
		if m.LastRunAt == nil {
			// Never run — immediately due
			nextRun = now
			isDue = true
		} else {
			lastRun, err := time.Parse(time.RFC3339, *m.LastRunAt)
			if err != nil {
				nextRun = now
				isDue = true
			} else {
				nextRun = lastRun.Add(cadenceDuration)
				isDue = now.After(nextRun) || now.Equal(nextRun)
			}
		}

		entries = append(entries, OrbitScheduleEntry{
			MissionID: m.ID,
			Title:     m.Title,
			OrbitType: m.OrbitType,
			Cadence:   m.Cadence,
			AutoRun:   m.AutoRun,
			IsDue:     isDue,
			NextRunAt: nextRun.UTC().Format(time.RFC3339),
		})
	}

	return c.JSON(fiber.Map{"schedule": entries})
}

// StartScheduler starts a background goroutine that checks for due
// auto-run missions every orbitScheduleCheckIntervalSec seconds and
// marks them as run. The goroutine stops when the provided done channel
// is closed.
func (h *OrbitHandler) StartScheduler(done <-chan struct{}) {
	ticker := time.NewTicker(time.Duration(orbitScheduleCheckIntervalSec) * time.Second)
	safego.GoWith("orbit-scheduler", func() {
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				h.checkDueMissions()
			}
		}
	})
}

// checkDueMissions iterates all missions and auto-runs those that are
// due and have autoRun enabled.
func (h *OrbitHandler) checkDueMissions() {
	h.mu.RLock()
	now := time.Now().UTC()
	dueMissionIDs := make([]string, 0)
	dueMissions := make([]*OrbitMission, 0)
	for _, m := range h.missions {
		if !m.AutoRun {
			continue
		}
		cadenceHrs, ok := orbitCadenceHours[m.Cadence]
		if !ok {
			continue
		}
		cadenceDuration := time.Duration(cadenceHrs * float64(time.Hour))

		isDue := false
		if m.LastRunAt == nil {
			isDue = true
		} else {
			lastRun, err := time.Parse(time.RFC3339, *m.LastRunAt)
			if err != nil {
				isDue = true
			} else {
				isDue = now.After(lastRun.Add(cadenceDuration))
			}
		}

		if isDue {
			dueMissionIDs = append(dueMissionIDs, m.ID)
			dueMissions = append(dueMissions, cloneOrbitMission(m))
		}
	}
	h.mu.RUnlock()

	for idx, mission := range dueMissions {
		execCtx, execCancel := context.WithTimeout(context.Background(), orbitMissionExecTimeout)
		result, summary := h.executeMission(execCtx, mission, orbitSchedulerNoExecutorSummary)
		execCancel()
		runAt := time.Now().UTC().Format(time.RFC3339)
		h.recordMissionRun(dueMissionIDs[idx], runAt, result, summary)
		slog.Info("orbit auto-run triggered", "mission", mission.ID, "type", mission.OrbitType, "result", result, "summary", summary)
	}
}

func (h *OrbitHandler) executeMission(ctx context.Context, mission *OrbitMission, noExecutorSummary string) (string, string) {
	if h.executor == nil {
		return "skipped", noExecutorSummary
	}

	result, summary, err := h.executor.Execute(ctx, mission)
	if err != nil {
		return "failed", err.Error()
	}

	return result, summary
}

func cloneOrbitMission(m *OrbitMission) *OrbitMission {
	if m == nil {
		return nil
	}

	cloned := *m
	cloned.Clusters = append([]string(nil), m.Clusters...)
	cloned.Steps = append([]OrbitStep(nil), m.Steps...)
	cloned.History = append([]OrbitRunRecord(nil), m.History...)
	return &cloned
}

func (h *OrbitHandler) recordMissionRun(id, runAt, result, summary string) {
	h.mu.Lock()
	mission, ok := h.missions[id]
	if !ok {
		h.mu.Unlock()
		return
	}
	mission.LastRunAt = &runAt
	mission.LastRunResult = &result
	mission.History = append(mission.History, OrbitRunRecord{
		Timestamp: runAt,
		Result:    result,
		Summary:   summary,
	})
	if len(mission.History) > orbitMaxHistoryEntries {
		mission.History = mission.History[len(mission.History)-orbitMaxHistoryEntries:]
	}
	h.saveToDiskLocked()
	h.mu.Unlock()
}

// ─── Persistence ────────────────────────────────────────────────────

// loadFromDisk reads the JSON data file and populates in-memory state.
func (h *OrbitHandler) loadFromDisk() {
	data, err := os.ReadFile(h.dataFile)
	if err != nil {
		if !os.IsNotExist(err) {
			slog.Warn("orbit: failed to read data file", "path", h.dataFile, "error", err)
		}
		return
	}

	missions := make([]*OrbitMission, 0)
	if err := json.Unmarshal(data, &missions); err != nil {
		slog.Warn("orbit: failed to parse data file", "path", h.dataFile, "error", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	for _, m := range missions {
		h.missions[m.ID] = m
	}
	slog.Info("orbit: loaded missions from disk", "count", len(missions))
}

// saveToDisk persists all missions to the JSON data file.
//
// Takes an exclusive write lock so only one goroutine writes at a time.
// Previously this used RLock(), which allowed the background scheduler
// (checkDueMissions) and concurrent HTTP handlers to enter os.WriteFile
// simultaneously and corrupt the orbit_missions.json file (issue 8003).
func (h *OrbitHandler) saveToDisk() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.saveToDiskLocked()
}

// saveToDiskLocked persists missions. The caller must hold the write lock
// (h.mu.Lock, not RLock) — concurrent entries would race on the file write.
func (h *OrbitHandler) saveToDiskLocked() {
	missions := make([]*OrbitMission, 0, len(h.missions))
	for _, m := range h.missions {
		missions = append(missions, m)
	}

	data, err := json.MarshalIndent(missions, "", "  ")
	if err != nil {
		slog.Error("orbit: failed to marshal missions", "error", err)
		return
	}

	// Ensure directory exists
	dir := filepath.Dir(h.dataFile)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		slog.Error("orbit: failed to create data directory", "path", dir, "error", err)
		return
	}

	// Atomic write: write to a temp file in the same directory and then
	// rename over the target. Rename is atomic on the same filesystem, so
	// a concurrent reader (or a crash mid-write) either sees the old
	// complete file or the new complete file — never a partial one.
	// Belt-and-braces alongside the write-lock switch above — if a future
	// caller accidentally holds only a read lock, an interrupted write
	// still can't leave behind a corrupted target file.
	tmp, err := os.CreateTemp(dir, ".orbit_missions-*.json.tmp")
	if err != nil {
		slog.Error("orbit: failed to create temp data file", "dir", dir, "error", err)
		return
	}
	tmpPath := tmp.Name()
	// Best-effort cleanup if we bail out before the rename.
	defer func() {
		if _, err := os.Stat(tmpPath); err == nil {
			if err := os.Remove(tmpPath); err != nil {
				slog.Warn("orbit: failed to clean up temp file", "path", tmpPath, "error", err)
			}
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		slog.Error("orbit: failed to write temp data file", "path", tmpPath, "error", err)
		if err := tmp.Close(); err != nil {
			slog.Warn("orbit: failed to close temp file after write error", "path", tmpPath, "error", err)
		}
		return
	}
	if err := tmp.Sync(); err != nil {
		slog.Error("orbit: failed to fsync temp data file", "path", tmpPath, "error", err)
		if err := tmp.Close(); err != nil {
			slog.Warn("orbit: failed to close temp file after sync error", "path", tmpPath, "error", err)
		}
		return
	}
	if err := tmp.Close(); err != nil {
		slog.Error("orbit: failed to close temp data file", "path", tmpPath, "error", err)
		return
	}
	if err := os.Chmod(tmpPath, 0o644); err != nil {
		slog.Warn("orbit: failed to chmod temp data file", "path", tmpPath, "error", err)
		// Non-fatal — proceed with rename; the file is still ours.
	}
	if err := os.Rename(tmpPath, h.dataFile); err != nil {
		slog.Error("orbit: failed to rename temp data file", "from", tmpPath, "to", h.dataFile, "error", err)
		return
	}
}
