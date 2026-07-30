package k8s

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// ────────────────────────────────────────────────────────────────────────────
// parseGeneratorTypes — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestParseGeneratorTypes_SingleList(t *testing.T) {
	generators := []interface{}{
		map[string]interface{}{"list": map[string]interface{}{"elements": []interface{}{}}},
	}
	got := parseGeneratorTypes(generators)
	assert.Equal(t, []string{"list"}, got)
}

func TestParseGeneratorTypes_MultipleMixed(t *testing.T) {
	generators := []interface{}{
		map[string]interface{}{"clusters": map[string]interface{}{}},
		map[string]interface{}{"git": map[string]interface{}{"repoURL": "https://github.com/org/repo"}},
	}
	got := parseGeneratorTypes(generators)
	assert.Equal(t, []string{"clusters", "git"}, got)
}

func TestParseGeneratorTypes_Matrix(t *testing.T) {
	generators := []interface{}{
		map[string]interface{}{"matrix": map[string]interface{}{"generators": []interface{}{}}},
	}
	got := parseGeneratorTypes(generators)
	assert.Equal(t, []string{"matrix"}, got)
}

func TestParseGeneratorTypes_AllKnownTypes(t *testing.T) {
	knownTypes := []string{"list", "clusters", "cluster", "git", "matrix", "merge", "scmProvider", "pullRequest", "clusterDecisionResource"}
	for _, typ := range knownTypes {
		generators := []interface{}{
			map[string]interface{}{typ: map[string]interface{}{}},
		}
		got := parseGeneratorTypes(generators)
		assert.Equal(t, []string{typ}, got, "should detect %s generator", typ)
	}
}

func TestParseGeneratorTypes_UnknownType(t *testing.T) {
	generators := []interface{}{
		map[string]interface{}{"customPlugin": map[string]interface{}{}},
	}
	got := parseGeneratorTypes(generators)
	assert.Equal(t, []string{"unknown"}, got)
}

func TestParseGeneratorTypes_EmptySlice(t *testing.T) {
	got := parseGeneratorTypes([]interface{}{})
	assert.Equal(t, []string{"unknown"}, got)
}

func TestParseGeneratorTypes_InvalidEntry(t *testing.T) {
	generators := []interface{}{
		"not-a-map",
		42,
	}
	got := parseGeneratorTypes(generators)
	assert.Equal(t, []string{"unknown"}, got, "non-map entries are skipped")
}

func TestParseGeneratorTypes_MixedValidAndInvalid(t *testing.T) {
	generators := []interface{}{
		"invalid",
		map[string]interface{}{"git": map[string]interface{}{}},
		nil,
	}
	got := parseGeneratorTypes(generators)
	assert.Equal(t, []string{"git"}, got)
}

// ────────────────────────────────────────────────────────────────────────────
// parseAppSetConditionStatus — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestParseAppSetConditionStatus_Healthy(t *testing.T) {
	conditions := []interface{}{
		map[string]interface{}{
			"type":   "ResourcesUpToDate",
			"status": "True",
		},
	}
	assert.Equal(t, "Healthy", parseAppSetConditionStatus(conditions))
}

func TestParseAppSetConditionStatus_Error(t *testing.T) {
	conditions := []interface{}{
		map[string]interface{}{
			"type":   "ErrorOccurred",
			"status": "True",
		},
	}
	assert.Equal(t, "Error", parseAppSetConditionStatus(conditions))
}

func TestParseAppSetConditionStatus_ErrorTakesPriority(t *testing.T) {
	// Error condition before ResourcesUpToDate
	conditions := []interface{}{
		map[string]interface{}{
			"type":   "ErrorOccurred",
			"status": "True",
		},
		map[string]interface{}{
			"type":   "ResourcesUpToDate",
			"status": "True",
		},
	}
	assert.Equal(t, "Error", parseAppSetConditionStatus(conditions))
}

func TestParseAppSetConditionStatus_Progressing(t *testing.T) {
	// Neither error nor up-to-date
	conditions := []interface{}{
		map[string]interface{}{
			"type":   "ResourcesUpToDate",
			"status": "False",
		},
	}
	assert.Equal(t, "Progressing", parseAppSetConditionStatus(conditions))
}

func TestParseAppSetConditionStatus_EmptyConditions(t *testing.T) {
	assert.Equal(t, "Progressing", parseAppSetConditionStatus([]interface{}{}))
}

func TestParseAppSetConditionStatus_InvalidCondition(t *testing.T) {
	conditions := []interface{}{
		"not-a-map",
		42,
	}
	assert.Equal(t, "Progressing", parseAppSetConditionStatus(conditions))
}

func TestParseAppSetConditionStatus_ErrorFalseIsNotError(t *testing.T) {
	conditions := []interface{}{
		map[string]interface{}{
			"type":   "ErrorOccurred",
			"status": "False",
		},
	}
	assert.Equal(t, "Progressing", parseAppSetConditionStatus(conditions))
}

// ────────────────────────────────────────────────────────────────────────────
// parseArgoApplicationsFromList — was 54.8%
// ────────────────────────────────────────────────────────────────────────────

func TestParseArgoApplicationsFromList_FullApp(t *testing.T) {
	m := &MultiClusterClient{}
	list := &unstructured.UnstructuredList{
		Items: []unstructured.Unstructured{{
			Object: map[string]interface{}{
				"apiVersion": "argoproj.io/v1alpha1",
				"kind":       "Application",
				"metadata": map[string]interface{}{
					"name":      "my-app",
					"namespace": "argocd",
				},
				"spec": map[string]interface{}{
					"source": map[string]interface{}{
						"repoURL":        "https://github.com/org/repo",
						"path":           "charts/my-app",
						"targetRevision": "main",
					},
				},
				"status": map[string]interface{}{
					"sync": map[string]interface{}{
						"status": "Synced",
					},
					"health": map[string]interface{}{
						"status": "Healthy",
					},
					"operationState": map[string]interface{}{
						"finishedAt": "2026-06-12T10:00:00Z",
					},
				},
			},
		}},
	}

	apps, err := m.parseArgoApplicationsFromList(list, "prod-cluster")
	require.NoError(t, err)
	require.Len(t, apps, 1)

	app := apps[0]
	assert.Equal(t, "my-app", app.Name)
	assert.Equal(t, "argocd", app.Namespace)
	assert.Equal(t, "prod-cluster", app.Cluster)
	assert.Equal(t, "Synced", app.SyncStatus)
	assert.Equal(t, "Healthy", app.HealthStatus)
	assert.Equal(t, "https://github.com/org/repo", app.Source.RepoURL)
	assert.Equal(t, "charts/my-app", app.Source.Path)
	assert.Equal(t, "main", app.Source.TargetRevision)
	assert.NotEmpty(t, app.LastSynced)
}

func TestParseArgoApplicationsFromList_FallbackReconciledAt(t *testing.T) {
	m := &MultiClusterClient{}
	list := &unstructured.UnstructuredList{
		Items: []unstructured.Unstructured{{
			Object: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name":      "fallback-app",
					"namespace": "argocd",
				},
				"status": map[string]interface{}{
					"sync":         map[string]interface{}{"status": "OutOfSync"},
					"health":       map[string]interface{}{"status": "Degraded"},
					"reconciledAt": "2026-06-11T08:00:00Z",
				},
			},
		}},
	}

	apps, err := m.parseArgoApplicationsFromList(list, "staging")
	require.NoError(t, err)
	require.Len(t, apps, 1)
	assert.Equal(t, "OutOfSync", apps[0].SyncStatus)
	assert.Equal(t, "Degraded", apps[0].HealthStatus)
	assert.NotEmpty(t, apps[0].LastSynced, "should use reconciledAt as fallback")
}

func TestParseArgoApplicationsFromList_NoStatus(t *testing.T) {
	m := &MultiClusterClient{}
	list := &unstructured.UnstructuredList{
		Items: []unstructured.Unstructured{{
			Object: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name":      "minimal-app",
					"namespace": "argocd",
				},
			},
		}},
	}

	apps, err := m.parseArgoApplicationsFromList(list, "dev")
	require.NoError(t, err)
	require.Len(t, apps, 1)
	assert.Equal(t, "Unknown", apps[0].SyncStatus)
	assert.Equal(t, "Unknown", apps[0].HealthStatus)
	assert.Empty(t, apps[0].LastSynced)
}

func TestParseArgoApplicationsFromList_NotUnstructuredList(t *testing.T) {
	m := &MultiClusterClient{}
	apps, err := m.parseArgoApplicationsFromList("invalid", "cluster")
	require.NoError(t, err)
	assert.Empty(t, apps)
}

func TestParseArgoApplicationsFromList_EmptyList(t *testing.T) {
	m := &MultiClusterClient{}
	list := &unstructured.UnstructuredList{Items: []unstructured.Unstructured{}}
	apps, err := m.parseArgoApplicationsFromList(list, "cluster")
	require.NoError(t, err)
	assert.Empty(t, apps)
}

// ────────────────────────────────────────────────────────────────────────────
// parseArgoApplicationSetsFromList — was 53.6%
// ────────────────────────────────────────────────────────────────────────────

func TestParseArgoApplicationSetsFromList_Full(t *testing.T) {
	m := &MultiClusterClient{}
	list := &unstructured.UnstructuredList{
		Items: []unstructured.Unstructured{{
			Object: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name":      "my-appset",
					"namespace": "argocd",
				},
				"spec": map[string]interface{}{
					"generators": []interface{}{
						map[string]interface{}{"clusters": map[string]interface{}{}},
						map[string]interface{}{"git": map[string]interface{}{}},
					},
					"template": map[string]interface{}{
						"metadata": map[string]interface{}{
							"name": "{{cluster}}-app",
						},
						"spec": map[string]interface{}{
							"syncPolicy": map[string]interface{}{
								"automated": map[string]interface{}{},
							},
						},
					},
				},
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{
							"type":   "ResourcesUpToDate",
							"status": "True",
						},
					},
					"applicationStatus": []interface{}{
						map[string]interface{}{"application": "app1"},
						map[string]interface{}{"application": "app2"},
						map[string]interface{}{"application": "app3"},
					},
				},
			},
		}},
	}

	appSets := m.parseArgoApplicationSetsFromList(list, "mgmt-cluster")
	require.Len(t, appSets, 1)

	appSet := appSets[0]
	assert.Equal(t, "my-appset", appSet.Name)
	assert.Equal(t, "argocd", appSet.Namespace)
	assert.Equal(t, "mgmt-cluster", appSet.Cluster)
	assert.Equal(t, []string{"clusters", "git"}, appSet.Generators)
	assert.Equal(t, "{{cluster}}-app", appSet.Template)
	assert.Equal(t, "Automated", appSet.SyncPolicy)
	assert.Equal(t, "Healthy", appSet.Status)
	assert.Equal(t, 3, appSet.AppCount)
}

func TestParseArgoApplicationSetsFromList_ManualSyncPolicy(t *testing.T) {
	m := &MultiClusterClient{}
	list := &unstructured.UnstructuredList{
		Items: []unstructured.Unstructured{{
			Object: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name":      "manual-appset",
					"namespace": "argocd",
				},
				"spec": map[string]interface{}{
					"generators": []interface{}{
						map[string]interface{}{"list": map[string]interface{}{}},
					},
					"template": map[string]interface{}{
						"metadata": map[string]interface{}{"name": "tmpl"},
						"spec": map[string]interface{}{
							// No syncPolicy or syncPolicy without automated
							"syncPolicy": map[string]interface{}{
								"syncOptions": []interface{}{"CreateNamespace=true"},
							},
						},
					},
				},
			},
		}},
	}

	appSets := m.parseArgoApplicationSetsFromList(list, "cluster")
	require.Len(t, appSets, 1)
	assert.Equal(t, "Manual", appSets[0].SyncPolicy)
}

func TestParseArgoApplicationSetsFromList_NoSpec(t *testing.T) {
	m := &MultiClusterClient{}
	list := &unstructured.UnstructuredList{
		Items: []unstructured.Unstructured{{
			Object: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name":      "bare-appset",
					"namespace": "argocd",
				},
			},
		}},
	}

	appSets := m.parseArgoApplicationSetsFromList(list, "cluster")
	require.Len(t, appSets, 1)
	assert.Equal(t, "bare-appset", appSets[0].Name)
	assert.Equal(t, "Unknown", appSets[0].Status)
	assert.Empty(t, appSets[0].Generators)
}

func TestParseArgoApplicationSetsFromList_ErrorStatus(t *testing.T) {
	m := &MultiClusterClient{}
	list := &unstructured.UnstructuredList{
		Items: []unstructured.Unstructured{{
			Object: map[string]interface{}{
				"metadata": map[string]interface{}{"name": "err-appset", "namespace": "argocd"},
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "ErrorOccurred", "status": "True"},
					},
				},
			},
		}},
	}

	appSets := m.parseArgoApplicationSetsFromList(list, "cluster")
	require.Len(t, appSets, 1)
	assert.Equal(t, "Error", appSets[0].Status)
}

func TestParseArgoApplicationSetsFromList_NotUnstructuredList(t *testing.T) {
	m := &MultiClusterClient{}
	appSets := m.parseArgoApplicationSetsFromList("invalid", "cluster")
	assert.Empty(t, appSets)
}

func TestParseArgoApplicationSetsFromList_EmptyList(t *testing.T) {
	m := &MultiClusterClient{}
	list := &unstructured.UnstructuredList{Items: []unstructured.Unstructured{}}
	appSets := m.parseArgoApplicationSetsFromList(list, "cluster")
	assert.Empty(t, appSets)
}
