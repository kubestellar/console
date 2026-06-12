package updater

import (
	"log/slog"
	"os"
	"os/exec"
	"time"
)

// restartViaStartupScript spawns startup-oauth.sh as a detached process.
// startup-oauth.sh handles killing existing processes (including this one),
// port cleanup, .env loading, and starting kc-agent, backend, and frontend.
// After spawning, this process exits so the script can replace it.
func (uc *UpdateChecker) restartViaStartupScript(repoPath string) {
	scriptPath := repoPath + "/startup-oauth.sh"
	if _, err := os.Stat(scriptPath); err != nil {
		slog.Info("[AutoUpdate] startup-oauth.sh not found, falling back to exec", "path", scriptPath)
		uc.selfUpdateFallback(repoPath)
		return
	}

	// Redirect output to a log file so the child survives our exit.
	// If stdout/stderr inherit from this process, they become broken pipes
	// when os.Exit(0) closes the file descriptors, killing the child via SIGPIPE.
	logPath := repoPath + "/data/auto-update-restart.log"
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		slog.Warn("[AutoUpdate] cannot create restart log", "path", logPath, "error", err)
		logFile = nil
	}

	// Spawn the script in a new process group so it survives our exit
	cmd := exec.Command("bash", scriptPath) // #nosec G204 -- scriptPath is repoPath+"/startup-oauth.sh", not user input
	cmd.Dir = repoPath
	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	}
	// #6297: Setpgid is Unix-only; routed through a build-tagged helper
	// (restart_unix.go / restart_windows.go) so kc-agent compiles on Windows.
	SetDetachedProcessGroup(cmd)

	if err := cmd.Start(); err != nil {
		slog.Error("[AutoUpdate] failed to spawn startup-oauth.sh", "error", err)
		if logFile != nil {
			logFile.Close()
		}
		uc.selfUpdateFallback(repoPath)
		return
	}

	slog.Info("[AutoUpdate] startup-oauth.sh spawned, exiting for restart", "pid", cmd.Process.Pid, "log", logPath)

	// Give the script a moment to start before we exit
	time.Sleep(1 * time.Second)

	if logFile != nil {
		logFile.Close()
	}

	// Exit this process — startup-oauth.sh will start fresh instances
	exit := uc.exitFunc
	if exit == nil {
		exit = os.Exit
	}
	exit(0)
}

// selfUpdateFallback rebuilds the kc-agent binary and replaces the running
// process via exec. Used as fallback when startup-oauth.sh is not available.
func (uc *UpdateChecker) selfUpdateFallback(repoPath string) {
	currentBinary, err := os.Executable()
	if err != nil {
		slog.Warn("[AutoUpdate] cannot determine kc-agent binary path", "error", err)
		return
	}

	slog.Info("[AutoUpdate] Falling back to self-update via exec...")

	// Kill and restart backend using the pre-built binary
	uc.killBackend()
	if err := uc.restartBackend(); err != nil {
		slog.Error("[AutoUpdate] backend restart failed", "error", err)
	}

	// Re-exec with the same args — replaces this process atomically on Unix.
	// #6297: Windows can't replace the current process image in place;
	// ExecReplace returns an error there and kc-agent logs it and keeps
	// running the old binary until the user restarts manually.
	if err := ExecReplace(currentBinary, os.Args, os.Environ()); err != nil {
		slog.Error("[AutoUpdate] exec into new kc-agent failed", "error", err)
	}
	// If exec succeeds on Unix, this line is never reached
}
