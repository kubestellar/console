package workers

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMaxClusterFanOut(t *testing.T) {
	require.Equal(t, 30, maxClusterFanOut)
}

func TestMaxClusterFanOut_NonZero(t *testing.T) {
	require.Greater(t, maxClusterFanOut, 0, "maxClusterFanOut must be positive")
}
