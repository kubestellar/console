package k8s

import (
	"context"
	"time"

	"github.com/kubestellar/console/pkg/models"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// OpenShiftUserGVR is the GroupVersionResource for OpenShift users
var OpenShiftUserGVR = schema.GroupVersionResource{
	Group:    "user.openshift.io",
	Version:  "v1",
	Resource: "users",
}

// ListOpenShiftUsers returns all OpenShift users (users.user.openshift.io) from a cluster
func (m *MultiClusterClient) ListOpenShiftUsers(ctx context.Context, contextName string) ([]models.OpenShiftUser, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	list, err := dynamicClient.Resource(OpenShiftUserGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		// OpenShift User CRD might not be installed (non-OpenShift cluster)
		return []models.OpenShiftUser{}, nil
	}

	var users []models.OpenShiftUser
	for _, item := range list.Items {
		user := parseOpenShiftUser(item, contextName)
		users = append(users, user)
	}

	return users, nil
}

// parseOpenShiftUser extracts user info from an unstructured OpenShift User object
func parseOpenShiftUser(item unstructured.Unstructured, cluster string) models.OpenShiftUser {
	user := models.OpenShiftUser{
		Cluster: cluster,
	}

	// Get name from metadata
	if name, found, _ := unstructured.NestedString(item.Object, "metadata", "name"); found {
		user.Name = name
	}

	// Get creationTimestamp from metadata (parsed from RFC3339 string).
	// CreatedAt is a *time.Time so it stays nil on absence or parse failure,
	// and `omitempty` in the JSON tag then actually omits it. See issue #6759.
	if createdAt, found, _ := unstructured.NestedString(item.Object, "metadata", "creationTimestamp"); found {
		if parsed, err := time.Parse(time.RFC3339, createdAt); err == nil {
			user.CreatedAt = &parsed
		}
	}

	// Get fullName
	if fullName, found, _ := unstructured.NestedString(item.Object, "fullName"); found {
		user.FullName = fullName
	}

	// Get identities (array of strings)
	if identities, found, _ := unstructured.NestedStringSlice(item.Object, "identities"); found {
		user.Identities = identities
	}

	// Get groups (array of strings)
	if groups, found, _ := unstructured.NestedStringSlice(item.Object, "groups"); found {
		user.Groups = groups
	}

	return user
}
