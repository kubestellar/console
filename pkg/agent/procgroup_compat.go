package agent

import (
	"os/exec"

	"github.com/kubestellar/console/pkg/agent/procutil"
)

// configureProcessGroup delegates to procutil.ConfigureProcessGroup.
func configureProcessGroup(cmd *exec.Cmd) {
	procutil.ConfigureProcessGroup(cmd)
}
