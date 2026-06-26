package k8s

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// --- labelsMatch tests ---

func TestLabelsMatch_AllMatch(t *testing.T) {
	selector := map[string]string{"app": "web", "env": "prod"}
	target := map[string]string{"app": "web", "env": "prod", "version": "v2"}
	assert.True(t, labelsMatch(selector, target))
}

func TestLabelsMatch_SubsetSelector(t *testing.T) {
	selector := map[string]string{"app": "web"}
	target := map[string]string{"app": "web", "env": "prod"}
	assert.True(t, labelsMatch(selector, target))
}

func TestLabelsMatch_MismatchedValue(t *testing.T) {
	selector := map[string]string{"app": "web", "env": "staging"}
	target := map[string]string{"app": "web", "env": "prod"}
	assert.False(t, labelsMatch(selector, target))
}

func TestLabelsMatch_MissingKey(t *testing.T) {
	selector := map[string]string{"app": "web", "tier": "frontend"}
	target := map[string]string{"app": "web"}
	assert.False(t, labelsMatch(selector, target))
}

func TestLabelsMatch_EmptySelector(t *testing.T) {
	// Empty selector matches everything
	selector := map[string]string{}
	target := map[string]string{"app": "web"}
	assert.True(t, labelsMatch(selector, target))
}

func TestLabelsMatch_EmptyTarget(t *testing.T) {
	selector := map[string]string{"app": "web"}
	target := map[string]string{}
	assert.False(t, labelsMatch(selector, target))
}

func TestLabelsMatch_BothEmpty(t *testing.T) {
	assert.True(t, labelsMatch(map[string]string{}, map[string]string{}))
}

// --- ingressReferencesServices tests ---

func TestIngressReferencesServices_DefaultBackend(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"defaultBackend": map[string]interface{}{
				"service": map[string]interface{}{
					"name": "frontend-svc",
					"port": map[string]interface{}{"number": int64(80)},
				},
			},
		},
	}
	svcSet := map[string]bool{"frontend-svc": true}
	assert.True(t, ingressReferencesServices(obj, svcSet))
}

func TestIngressReferencesServices_RulePathBackend(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"rules": []interface{}{
				map[string]interface{}{
					"host": "example.com",
					"http": map[string]interface{}{
						"paths": []interface{}{
							map[string]interface{}{
								"path":     "/api",
								"pathType": "Prefix",
								"backend": map[string]interface{}{
									"service": map[string]interface{}{
										"name": "api-svc",
										"port": map[string]interface{}{"number": int64(8080)},
									},
								},
							},
						},
					},
				},
			},
		},
	}
	svcSet := map[string]bool{"api-svc": true}
	assert.True(t, ingressReferencesServices(obj, svcSet))
}

func TestIngressReferencesServices_NoMatchingService(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"defaultBackend": map[string]interface{}{
				"service": map[string]interface{}{"name": "other-svc"},
			},
		},
	}
	svcSet := map[string]bool{"my-svc": true}
	assert.False(t, ingressReferencesServices(obj, svcSet))
}

func TestIngressReferencesServices_NoSpec(t *testing.T) {
	obj := map[string]interface{}{}
	svcSet := map[string]bool{"svc": true}
	assert.False(t, ingressReferencesServices(obj, svcSet))
}

func TestIngressReferencesServices_MultipleRules(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"rules": []interface{}{
				map[string]interface{}{
					"host": "app1.example.com",
					"http": map[string]interface{}{
						"paths": []interface{}{
							map[string]interface{}{
								"backend": map[string]interface{}{
									"service": map[string]interface{}{"name": "no-match"},
								},
							},
						},
					},
				},
				map[string]interface{}{
					"host": "app2.example.com",
					"http": map[string]interface{}{
						"paths": []interface{}{
							map[string]interface{}{
								"backend": map[string]interface{}{
									"service": map[string]interface{}{"name": "target-svc"},
								},
							},
						},
					},
				},
			},
		},
	}
	svcSet := map[string]bool{"target-svc": true}
	assert.True(t, ingressReferencesServices(obj, svcSet))
}

func TestIngressReferencesServices_EmptyServiceSet(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"defaultBackend": map[string]interface{}{
				"service": map[string]interface{}{"name": "any-svc"},
			},
		},
	}
	svcSet := map[string]bool{}
	assert.False(t, ingressReferencesServices(obj, svcSet))
}

func TestIngressReferencesServices_MalformedRules(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"rules": []interface{}{
				"not-a-map",
				map[string]interface{}{"http": "not-a-map"},
				map[string]interface{}{
					"http": map[string]interface{}{
						"paths": []interface{}{"not-a-map"},
					},
				},
			},
		},
	}
	svcSet := map[string]bool{"svc": true}
	assert.False(t, ingressReferencesServices(obj, svcSet))
}
