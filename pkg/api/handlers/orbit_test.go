package handlers

import (
	"testing"
	"time"
)

func TestOrbitCadenceHoursComplete(t *testing.T) {
	expected := map[string]float64{
		"daily":   24,
		"weekly":  168,
		"monthly": 720,
	}
	for cadence, hours := range expected {
		got, ok := orbitCadenceHours[cadence]
		if !ok {
			t.Errorf("missing cadence %q in orbitCadenceHours", cadence)
			continue
		}
		if got != hours {
			t.Errorf("orbitCadenceHours[%q] = %v, want %v", cadence, got, hours)
		}
	}
}

func TestIsDue(t *testing.T) {
	now := time.Now().UTC()

	tests := []struct {
		name      string
		cadence   string
		lastRunAt string
		wantDue   bool
	}{
		{
			name:      "daily mission run 25h ago is due",
			cadence:   "daily",
			lastRunAt: now.Add(-25 * time.Hour).Format(time.RFC3339),
			wantDue:   true,
		},
		{
			name:      "daily mission run 23h ago is not due",
			cadence:   "daily",
			lastRunAt: now.Add(-23 * time.Hour).Format(time.RFC3339),
			wantDue:   false,
		},
		{
			name:      "weekly mission run 8 days ago is due",
			cadence:   "weekly",
			lastRunAt: now.Add(-8 * 24 * time.Hour).Format(time.RFC3339),
			wantDue:   true,
		},
		{
			name:      "weekly mission run 6 days ago is not due",
			cadence:   "weekly",
			lastRunAt: now.Add(-6 * 24 * time.Hour).Format(time.RFC3339),
			wantDue:   false,
		},
		{
			name:      "monthly mission run 31 days ago is due",
			cadence:   "monthly",
			lastRunAt: now.Add(-31 * 24 * time.Hour).Format(time.RFC3339),
			wantDue:   true,
		},
		{
			name:      "never-run mission is due",
			cadence:   "weekly",
			lastRunAt: "",
			wantDue:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := &OrbitMission{
				Cadence: tt.cadence,
				AutoRun: true,
			}
			if tt.lastRunAt != "" {
				m.LastRunAt = &tt.lastRunAt
			}

			cadenceHrs, ok := orbitCadenceHours[m.Cadence]
			if !ok {
				t.Fatalf("unknown cadence %q", m.Cadence)
			}

			isDue := false
			if m.LastRunAt == nil || *m.LastRunAt == "" {
				isDue = true
			} else {
				lastRun, err := time.Parse(time.RFC3339, *m.LastRunAt)
				if err != nil {
					t.Fatalf("invalid lastRunAt: %v", err)
				}
				elapsed := time.Since(lastRun).Hours()
				isDue = elapsed >= cadenceHrs
			}

			if isDue != tt.wantDue {
				t.Errorf("isDue = %v, want %v", isDue, tt.wantDue)
			}
		})
	}
}

func TestOrbitMissionSerialization(t *testing.T) {
	m := &OrbitMission{
		ID:          "test-1",
		Title:       "Health Check",
		Description: "Check pod health",
		OrbitType:   "health-check",
		Cadence:     "weekly",
		AutoRun:     true,
		Clusters:    []string{"cluster-a"},
		Steps: []OrbitStep{
			{Title: "Check pods", Description: "Verify all pods running"},
		},
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		History:   []OrbitRunRecord{},
	}

	if m.ID != "test-1" {
		t.Errorf("ID = %q, want %q", m.ID, "test-1")
	}
	if m.OrbitType != "health-check" {
		t.Errorf("OrbitType = %q, want %q", m.OrbitType, "health-check")
	}
	if !m.AutoRun {
		t.Error("AutoRun should be true")
	}
	if len(m.Steps) != 1 {
		t.Errorf("Steps len = %d, want 1", len(m.Steps))
	}
	if m.LastRunAt != nil {
		t.Error("LastRunAt should be nil for new mission")
	}
}
