package k8s

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestRbacCache_SetAndGet(t *testing.T) {
	cache := &rbacCache{store: make(map[string]rbacCacheEntry)}

	items := []unstructured.Unstructured{
		{Object: map[string]interface{}{"metadata": map[string]interface{}{"name": "role1"}}},
		{Object: map[string]interface{}{"metadata": map[string]interface{}{"name": "role2"}}},
	}

	cache.set("cluster1:clusterroles", items)

	got, ok := cache.get("cluster1:clusterroles")
	assert.True(t, ok)
	assert.Len(t, got, 2)
	assert.Equal(t, "role1", got[0].GetName())
}

func TestRbacCache_GetMissingKey(t *testing.T) {
	cache := &rbacCache{store: make(map[string]rbacCacheEntry)}

	got, ok := cache.get("nonexistent")
	assert.False(t, ok)
	assert.Nil(t, got)
}

func TestRbacCache_GetExpiredEntry(t *testing.T) {
	cache := &rbacCache{store: make(map[string]rbacCacheEntry)}

	// Insert with a past fetchedAt time (simulating expiry)
	cache.store["old-key"] = rbacCacheEntry{
		items:     []unstructured.Unstructured{{Object: map[string]interface{}{}}},
		fetchedAt: time.Now().Add(-(rbacCacheTTL + time.Second)),
	}

	got, ok := cache.get("old-key")
	assert.False(t, ok, "expired entry should not be returned")
	assert.Nil(t, got)
}

func TestRbacCache_OverwriteExistingKey(t *testing.T) {
	cache := &rbacCache{store: make(map[string]rbacCacheEntry)}

	items1 := []unstructured.Unstructured{
		{Object: map[string]interface{}{"metadata": map[string]interface{}{"name": "v1"}}},
	}
	items2 := []unstructured.Unstructured{
		{Object: map[string]interface{}{"metadata": map[string]interface{}{"name": "v2"}}},
	}

	cache.set("key", items1)
	cache.set("key", items2)

	got, ok := cache.get("key")
	assert.True(t, ok)
	assert.Len(t, got, 1)
	assert.Equal(t, "v2", got[0].GetName())
}

func TestRbacCache_EmptyItems(t *testing.T) {
	cache := &rbacCache{store: make(map[string]rbacCacheEntry)}

	cache.set("empty", []unstructured.Unstructured{})

	got, ok := cache.get("empty")
	assert.True(t, ok)
	assert.Empty(t, got)
}

func TestRbacCache_NilItems(t *testing.T) {
	cache := &rbacCache{store: make(map[string]rbacCacheEntry)}

	cache.set("nil-items", nil)

	got, ok := cache.get("nil-items")
	assert.True(t, ok)
	assert.Nil(t, got)
}
