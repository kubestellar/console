package store

import (
	"database/sql"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGetDefaultNamespaceReturnsPodNamespaceEnv covers the previously
// uncovered POD_NAMESPACE-set branch of getDefaultNamespace()
// (pkg/store/persistence_config.go:85). Without this test, a regression
// that ignored POD_NAMESPACE (e.g. read the wrong env var name) would
// silently start writing console CRs into "kubestellar-console" no
// matter what namespace the pod actually ran in — an in-cluster
// misconfiguration that only surfaces at deploy time.
func TestGetDefaultNamespaceReturnsPodNamespaceEnv(t *testing.T) {
	t.Setenv("POD_NAMESPACE", "team-alpha")

	got := getDefaultNamespace()
	assert.Equal(t, "team-alpha", got,
		"POD_NAMESPACE must override the compiled-in default when set")
}

// TestGetDefaultNamespaceEmptyEnvFallsBackToDefault covers the fallback
// literal "kubestellar-console" at persistence_config.go:88. If someone
// mistakenly changed the fallback string, or inverted the empty check,
// this test catches it.
func TestGetDefaultNamespaceEmptyEnvFallsBackToDefault(t *testing.T) {
	t.Setenv("POD_NAMESPACE", "")

	got := getDefaultNamespace()
	assert.Equal(t, "kubestellar-console", got,
		"empty POD_NAMESPACE must fall through to the compiled-in default")
}

// TestFkConnectorDriverReturnsUnderlyingDriver covers fkConnector.Driver()
// at pkg/store/sqlite.go:52 (previously 0.0%). Trivial getter, but the
// database/sql package assumes it returns the same driver reference the
// connector was built with; a regression that returned nil or a wrapped
// driver would break sql.OpenDB's driver lookup silently.
func TestFkConnectorDriverReturnsUnderlyingDriver(t *testing.T) {
	drv, err := sqlDriver("sqlite")
	require.NoError(t, err, "sqlite driver must be registered in the test binary")

	c := &fkConnector{driver: drv, dsn: ":memory:"}
	assert.Same(t, drv, c.Driver(),
		"Driver() must return the exact driver reference the connector was built with")
}

// TestSqlDriverUnregisteredNameReturnsError covers the fallthrough error
// arm of sqlDriver() at pkg/store/sqlite.go:69 (previously uncovered by
// the happy path). Without this, a refactor that swallowed the "not
// registered" case would let Connect() start returning nil drivers and
// panic downstream inside sql.OpenDB.
func TestSqlDriverUnregisteredNameReturnsError(t *testing.T) {
	drv, err := sqlDriver("this-driver-does-not-exist")
	assert.Nil(t, drv, "unregistered driver name must not return a driver")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "this-driver-does-not-exist",
		"error must echo the requested driver name for diagnosability")
	assert.Contains(t, err.Error(), "not registered")
}

// TestFkConnectorConnectPreparesForeignKeysPragma covers the happy path
// of fkConnector.Connect end-to-end against an in-memory sqlite and
// asserts that foreign-key enforcement is actually ON afterward. This
// protects against a regression that dropped the PRAGMA call, which
// would silently disable FK cascades in production — critical for the
// dashboard cards / rewards tables that depend on ON DELETE CASCADE.
func TestFkConnectorConnectPreparesForeignKeysPragma(t *testing.T) {
	drv, err := sqlDriver("sqlite")
	require.NoError(t, err)

	c := &fkConnector{driver: drv, dsn: ":memory:"}

	db := sql.OpenDB(c)
	t.Cleanup(func() { _ = db.Close() })

	var fk int
	require.NoError(t, db.QueryRow("PRAGMA foreign_keys").Scan(&fk))
	assert.Equal(t, 1, fk,
		"fkConnector.Connect must leave PRAGMA foreign_keys = ON on the connection")
}
