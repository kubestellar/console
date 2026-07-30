package updater

import (
	"errors"
	"sync"
	"testing"
)

func TestSelfUpdateFallback_CallsKillAndRestartBackend(t *testing.T) {
	var mu sync.Mutex
	var killed, restarted bool

	origExecReplace := execReplaceFunc
	defer func() { execReplaceFunc = origExecReplace }()
	execReplaceFunc = func(_ string, _, _ []string) error {
		return errors.New("test: exec replace sentinel")
	}

	uc := &UpdateChecker{
		killBackend: func() bool {
			mu.Lock()
			killed = true
			mu.Unlock()
			return true
		},
		restartBackend: func() error {
			mu.Lock()
			restarted = true
			mu.Unlock()
			return nil
		},
		exitFunc: func(_ int) {},
	}

	uc.selfUpdateFallback(t.TempDir())

	mu.Lock()
	defer mu.Unlock()
	if !killed {
		t.Error("expected killBackend to be called")
	}
	if !restarted {
		t.Error("expected restartBackend to be called")
	}
}

func TestSelfUpdateFallback_ProceedsToExecAfterRestartBackendError(t *testing.T) {
	var execCalled bool

	origExecReplace := execReplaceFunc
	defer func() { execReplaceFunc = origExecReplace }()
	execReplaceFunc = func(_ string, _, _ []string) error {
		execCalled = true
		return nil
	}

	uc := &UpdateChecker{
		killBackend:    func() bool { return true },
		restartBackend: func() error { return errors.New("backend restart failed") },
		exitFunc:       func(_ int) {},
	}

	uc.selfUpdateFallback(t.TempDir())

	if !execCalled {
		t.Error("expected execReplaceFunc to be called even after restartBackend error")
	}
}

func TestSelfUpdateFallback_PassesCurrentBinaryToExec(t *testing.T) {
	var gotBinary string

	origExecReplace := execReplaceFunc
	defer func() { execReplaceFunc = origExecReplace }()
	execReplaceFunc = func(binary string, _ []string, _ []string) error {
		gotBinary = binary
		return errors.New("test: exec replace sentinel")
	}

	uc := &UpdateChecker{
		killBackend:    func() bool { return true },
		restartBackend: func() error { return nil },
		exitFunc:       func(_ int) {},
	}

	uc.selfUpdateFallback(t.TempDir())

	if gotBinary == "" {
		t.Error("expected execReplaceFunc to receive a non-empty binary path")
	}
}
