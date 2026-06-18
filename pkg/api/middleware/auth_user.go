package middleware

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

const (
	// userValidationCacheTTL is how long a successful or failed user freshness
	// lookup remains valid before the middleware hits the store again.
	userValidationCacheTTL = 30 * time.Second
)

type userActiveLookupStore interface {
	GetUser(ctx context.Context, id uuid.UUID) (*models.User, error)
}

type userValidationCacheEntry struct {
	role      models.UserRole
	exists    bool
	checkedAt time.Time
}

var (
	userValidationStoreMu sync.RWMutex
	userValidationStore   userActiveLookupStore
	userValidationCache   sync.Map
)

var (
	errInvalidUserClaims    = errors.New("invalid user claims")
	errUserInactive         = errors.New("user is no longer active")
	errUserRoleChanged      = errors.New("user role changed")
	errUserValidationFailed = errors.New("user validation failed")
)

// InitUserValidation enables per-request user freshness checks for authenticated
// requests. The configured store is consulted on cache misses to ensure the user
// still exists and still holds the role encoded in the JWT.
func InitUserValidation(store userActiveLookupStore) {
	userValidationStoreMu.Lock()
	userValidationStore = store
	userValidationCache = sync.Map{}
	userValidationStoreMu.Unlock()
}

func getUserValidationStore() userActiveLookupStore {
	userValidationStoreMu.RLock()
	defer userValidationStoreMu.RUnlock()
	return userValidationStore
}

func resetUserValidationForTest() {
	userValidationStoreMu.Lock()
	userValidationStore = nil
	userValidationCache = sync.Map{}
	userValidationStoreMu.Unlock()
}

// ValidateUserActive ensures the authenticated user still exists and still has
// the role encoded in the JWT. A short-lived cache avoids repeated store hits
// for hot paths while ensuring deletions and role changes take effect quickly.
func ValidateUserActive(ctx context.Context, claims *UserClaims) error {
	store := getUserValidationStore()
	if store == nil {
		return nil
	}
	if claims == nil || claims.UserID == uuid.Nil || claims.Role == "" {
		return errInvalidUserClaims
	}

	cacheKey := claims.UserID.String()
	if cached, ok := userValidationCache.Load(cacheKey); ok {
		entry, ok := cached.(userValidationCacheEntry)
		if ok {
			if time.Since(entry.checkedAt) <= userValidationCacheTTL {
				if !entry.exists {
					return errUserInactive
				}
				if entry.role != claims.Role {
					return errUserRoleChanged
				}
				return nil
			}
			userValidationCache.Delete(cacheKey)
		}
	}

	user, err := store.GetUser(ctx, claims.UserID)
	if err != nil {
		return fmt.Errorf("%w: %w", errUserValidationFailed, err)
	}

	entry := userValidationCacheEntry{checkedAt: time.Now()}
	if user == nil {
		entry.exists = false
		userValidationCache.Store(cacheKey, entry)
		return errUserInactive
	}

	entry.exists = true
	entry.role = user.Role
	userValidationCache.Store(cacheKey, entry)
	if user.Role != claims.Role {
		return errUserRoleChanged
	}
	return nil
}
