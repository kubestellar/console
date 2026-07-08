package agent

import "errors"

// errNoShellFound is returned by resolveShell when no usable shell binary
// can be located on the system PATH.
var errNoShellFound = errors.New("no usable shell found on PATH")
