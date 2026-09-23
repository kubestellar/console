package handlers

import "github.com/kubestellar/console/pkg/api/handlers/persistence"

// Type alias allows call sites (e.g. route registration) to continue
// referring to handlers.ConsolePersistenceHandlers after the console
// persistence handler/store/validation files moved into their own
// pkg/api/handlers/persistence subpackage (epic #23685 phase 1). New code
// should import pkg/api/handlers/persistence directly.
type ConsolePersistenceHandlers = persistence.ConsolePersistenceHandlers

// NewConsolePersistenceHandlers delegates to persistence.NewConsolePersistenceHandlers.
var NewConsolePersistenceHandlers = persistence.NewConsolePersistenceHandlers
