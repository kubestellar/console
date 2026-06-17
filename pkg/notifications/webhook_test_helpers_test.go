package notifications

import "testing"

const testLoopbackWebhookAllowedHosts = "localhost,localhost.localdomain,127.0.0.1,127.0.0.2,127.1.2.3,::1,::ffff:127.0.0.1"

func allowLoopbackWebhookHostsForTest(t *testing.T) {
	t.Helper()
	t.Setenv(webhookAllowedHostsEnv, testLoopbackWebhookAllowedHosts)
}
