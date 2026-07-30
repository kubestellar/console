package agent

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestErrNoShellFound(t *testing.T) {
	require.NotNil(t, errNoShellFound)
	require.Equal(t, "no usable shell found on PATH", errNoShellFound.Error())
}

func TestErrNoShellFound_IsError(t *testing.T) {
	var err error = errNoShellFound
	require.Error(t, err)
	require.True(t, errors.Is(err, errNoShellFound))
}
