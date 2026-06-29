package agent

import "testing"

func TestErrNoShellFound_IsNotNil(t *testing.T) {
	if errNoShellFound == nil {
		t.Fatal("errNoShellFound should not be nil")
	}
}

func TestErrNoShellFound_Message(t *testing.T) {
	const want = "no usable shell found on PATH"
	if errNoShellFound.Error() != want {
		t.Errorf("errNoShellFound.Error() = %q, want %q", errNoShellFound.Error(), want)
	}
}
