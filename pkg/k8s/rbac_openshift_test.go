package k8s

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestParseOpenShiftUser_FullFields(t *testing.T) {
	item := unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name":              "admin",
				"creationTimestamp": "2025-01-15T10:30:00Z",
			},
			"fullName":   "Admin User",
			"identities": []interface{}{"htpasswd:admin", "ldap:cn=admin,dc=example"},
			"groups":     []interface{}{"admins", "developers"},
		},
	}

	user := parseOpenShiftUser(item, "prod-cluster")

	require.Equal(t, "admin", user.Name)
	require.Equal(t, "prod-cluster", user.Cluster)
	require.Equal(t, "Admin User", user.FullName)
	require.NotNil(t, user.CreatedAt)
	expectedTime := time.Date(2025, 1, 15, 10, 30, 0, 0, time.UTC)
	require.Equal(t, expectedTime, *user.CreatedAt)
	require.Equal(t, []string{"htpasswd:admin", "ldap:cn=admin,dc=example"}, user.Identities)
	require.Equal(t, []string{"admins", "developers"}, user.Groups)
}

func TestParseOpenShiftUser_MinimalFields(t *testing.T) {
	item := unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name": "user1",
			},
		},
	}

	user := parseOpenShiftUser(item, "dev-cluster")

	require.Equal(t, "user1", user.Name)
	require.Equal(t, "dev-cluster", user.Cluster)
	require.Empty(t, user.FullName)
	require.Nil(t, user.CreatedAt)
	require.Nil(t, user.Identities)
	require.Nil(t, user.Groups)
}

func TestParseOpenShiftUser_InvalidTimestamp(t *testing.T) {
	item := unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name":              "badtime",
				"creationTimestamp": "not-a-valid-time",
			},
		},
	}

	user := parseOpenShiftUser(item, "test-cluster")

	require.Equal(t, "badtime", user.Name)
	require.Nil(t, user.CreatedAt, "invalid timestamp should result in nil CreatedAt")
}

func TestParseOpenShiftUser_EmptyObject(t *testing.T) {
	item := unstructured.Unstructured{
		Object: map[string]interface{}{},
	}

	user := parseOpenShiftUser(item, "empty-cluster")

	require.Equal(t, "empty-cluster", user.Cluster)
	require.Empty(t, user.Name)
	require.Empty(t, user.FullName)
	require.Nil(t, user.CreatedAt)
	require.Nil(t, user.Identities)
	require.Nil(t, user.Groups)
}

func TestParseOpenShiftUser_EmptyGroups(t *testing.T) {
	item := unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name": "nogroups",
			},
			"identities": []interface{}{"github:user123"},
			"groups":     []interface{}{},
		},
	}

	user := parseOpenShiftUser(item, "staging")

	require.Equal(t, "nogroups", user.Name)
	require.Equal(t, []string{"github:user123"}, user.Identities)
	require.Empty(t, user.Groups)
}

func TestOpenShiftUserGVR_Values(t *testing.T) {
	require.Equal(t, "user.openshift.io", OpenShiftUserGVR.Group)
	require.Equal(t, "v1", OpenShiftUserGVR.Version)
	require.Equal(t, "users", OpenShiftUserGVR.Resource)
}
