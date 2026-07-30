package models

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReservationStatus_IsValid(t *testing.T) {
	cases := []struct {
		status ReservationStatus
		want   bool
	}{
		{ReservationStatusActive, true},
		{ReservationStatusCompleted, true},
		{ReservationStatusCancelled, true},
		{"unknown", false},
		{"", false},
		{"ACTIVE", false},
	}
	for _, tc := range cases {
		t.Run(string(tc.status), func(t *testing.T) {
			assert.Equal(t, tc.want, tc.status.IsValid())
		})
	}
}

func TestReservationStatus_CanTransitionTo(t *testing.T) {
	cases := []struct {
		from, to ReservationStatus
		want     bool
	}{
		// idempotent — same→same always allowed
		{ReservationStatusActive, ReservationStatusActive, true},
		{ReservationStatusCompleted, ReservationStatusCompleted, true},
		{ReservationStatusCancelled, ReservationStatusCancelled, true},
		// legal transitions from active
		{ReservationStatusActive, ReservationStatusCompleted, true},
		{ReservationStatusActive, ReservationStatusCancelled, true},
		// terminal states cannot transition forward
		{ReservationStatusCompleted, ReservationStatusActive, false},
		{ReservationStatusCompleted, ReservationStatusCancelled, false},
		{ReservationStatusCancelled, ReservationStatusActive, false},
		{ReservationStatusCancelled, ReservationStatusCompleted, false},
		// unknown source status
		{"unknown", ReservationStatusActive, false},
	}
	for _, tc := range cases {
		t.Run(string(tc.from)+"→"+string(tc.to), func(t *testing.T) {
			assert.Equal(t, tc.want, tc.from.CanTransitionTo(tc.to))
		})
	}
}

func TestGPUReservation_NormalizeGPUTypes(t *testing.T) {
	t.Run("promotes legacy GPUType when GPUTypes empty", func(t *testing.T) {
		r := &GPUReservation{GPUType: "A100"}
		r.NormalizeGPUTypes()
		require.Equal(t, []string{"A100"}, r.GPUTypes)
		assert.Equal(t, "A100", r.GPUType)
	})

	t.Run("sets GPUType from first GPUTypes entry", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"H100", "A100"}}
		r.NormalizeGPUTypes()
		assert.Equal(t, "H100", r.GPUType)
		assert.Equal(t, []string{"H100", "A100"}, r.GPUTypes)
	})

	t.Run("deduplicates GPUTypes preserving order", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"A100", "H100", "A100"}}
		r.NormalizeGPUTypes()
		assert.Equal(t, []string{"A100", "H100"}, r.GPUTypes)
		assert.Equal(t, "A100", r.GPUType)
	})

	t.Run("removes empty entries", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"", "V100", ""}}
		r.NormalizeGPUTypes()
		assert.Equal(t, []string{"V100"}, r.GPUTypes)
		assert.Equal(t, "V100", r.GPUType)
	})

	t.Run("both empty clears GPUType", func(t *testing.T) {
		r := &GPUReservation{}
		r.NormalizeGPUTypes()
		assert.Empty(t, r.GPUType)
		assert.Empty(t, r.GPUTypes)
	})

	t.Run("all-empty entries clears both", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"", ""}}
		r.NormalizeGPUTypes()
		assert.Empty(t, r.GPUType)
		assert.Empty(t, r.GPUTypes)
	})
}

func TestGPUReservation_MatchesNodeGPUType(t *testing.T) {
	t.Run("empty GPUTypes matches any node type", func(t *testing.T) {
		r := &GPUReservation{}
		assert.True(t, r.MatchesNodeGPUType("NVIDIA-A100"))
		assert.True(t, r.MatchesNodeGPUType(""))
	})

	t.Run("exact match (case-insensitive)", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"a100"}}
		assert.True(t, r.MatchesNodeGPUType("A100"))
		assert.True(t, r.MatchesNodeGPUType("a100"))
	})

	t.Run("substring: node type contains preference", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"A100"}}
		assert.True(t, r.MatchesNodeGPUType("NVIDIA A100-SXM4-80GB"))
	})

	t.Run("substring: preference contains node type", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"NVIDIA A100-SXM4-80GB"}}
		assert.True(t, r.MatchesNodeGPUType("A100"))
	})

	t.Run("no match when node type unrelated", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"A100"}}
		assert.False(t, r.MatchesNodeGPUType("H100"))
	})

	t.Run("matches second entry in multi-type list", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"H100", "A100"}}
		assert.True(t, r.MatchesNodeGPUType("A100"))
		assert.True(t, r.MatchesNodeGPUType("H100"))
		assert.False(t, r.MatchesNodeGPUType("V100"))
	})

	t.Run("empty GPUType entries in list are skipped", func(t *testing.T) {
		r := &GPUReservation{GPUTypes: []string{"", "A100"}}
		assert.True(t, r.MatchesNodeGPUType("A100"))
		assert.False(t, r.MatchesNodeGPUType("H100"))
	})
}
