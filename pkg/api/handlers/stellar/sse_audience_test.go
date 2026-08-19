package stellar

import (
	"testing"

	"github.com/kubestellar/console/pkg/store"
)

// TestStellarSSEAudienceFromUserID covers the primitive audience resolver:
// blank strings never match, "system" broadcasts to admins only, and any
// other value routes to the specific user. This is the choke point every
// broadcast to a signed-in user flows through.
func TestStellarSSEAudienceFromUserID(t *testing.T) {
	tests := []struct {
		name        string
		userID      string
		wantAudUser string
		wantAdmin   bool
		wantOK      bool
	}{
		{"empty rejects", "", "", false, false},
		{"whitespace-only rejects", "   ", "", false, false},
		{"system broadcasts admin-only", "system", "", true, true},
		{"regular userID routes to that user", "user-42", "user-42", false, true},
		{"whitespace around userID is trimmed", "  user-42  ", "user-42", false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotUser, gotAdmin, gotOK := stellarSSEAudienceFromUserID(tt.userID)
			if gotUser != tt.wantAudUser || gotAdmin != tt.wantAdmin || gotOK != tt.wantOK {
				t.Errorf("stellarSSEAudienceFromUserID(%q) = (%q,%v,%v), want (%q,%v,%v)",
					tt.userID, gotUser, gotAdmin, gotOK, tt.wantAudUser, tt.wantAdmin, tt.wantOK)
			}
		})
	}
}

// TestStellarSSEAudienceFromData covers every concrete type-switch branch
// in stellarSSEAudienceFromData: notifications, activities, actions,
// watches, solves — as both value and pointer, plus the string- and
// interface-keyed map fallbacks used by ad-hoc JSON payloads. This gate
// determines whether an event fans out to the wrong user, so exhaustive
// branch coverage is a security-relevant concern.
func TestStellarSSEAudienceFromData_TypedStructsAndPointers(t *testing.T) {
	const uid = "user-99"
	cases := []struct {
		name string
		data interface{}
	}{
		{"StellarNotification value", store.StellarNotification{UserID: uid}},
		{"StellarNotification pointer", &store.StellarNotification{UserID: uid}},
		{"StellarActivity value", store.StellarActivity{UserID: uid}},
		{"StellarActivity pointer", &store.StellarActivity{UserID: uid}},
		{"StellarAction value", store.StellarAction{UserID: uid}},
		{"StellarAction pointer", &store.StellarAction{UserID: uid}},
		{"StellarWatch value", store.StellarWatch{UserID: uid}},
		{"StellarWatch pointer", &store.StellarWatch{UserID: uid}},
		{"StellarSolve value", store.StellarSolve{UserID: uid}},
		{"StellarSolve pointer", &store.StellarSolve{UserID: uid}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotUser, gotAdmin, gotOK := stellarSSEAudienceFromData(tc.data)
			if !gotOK || gotAdmin || gotUser != uid {
				t.Errorf("data=%s: got (%q,%v,%v), want (%q,false,true)", tc.name, gotUser, gotAdmin, gotOK, uid)
			}
		})
	}
}

func TestStellarSSEAudienceFromData_NilPointersReturnNoAudience(t *testing.T) {
	// A typed nil pointer flowing through the SSE broadcast path must not
	// panic and must not route to any audience.
	cases := []struct {
		name string
		data interface{}
	}{
		{"*StellarNotification nil", (*store.StellarNotification)(nil)},
		{"*StellarActivity nil", (*store.StellarActivity)(nil)},
		{"*StellarAction nil", (*store.StellarAction)(nil)},
		{"*StellarWatch nil", (*store.StellarWatch)(nil)},
		{"*StellarSolve nil", (*store.StellarSolve)(nil)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotUser, gotAdmin, gotOK := stellarSSEAudienceFromData(tc.data)
			if gotOK || gotAdmin || gotUser != "" {
				t.Errorf("nil pointer must yield empty audience, got (%q,%v,%v)", gotUser, gotAdmin, gotOK)
			}
		})
	}
}

func TestStellarSSEAudienceFromData_SystemUserRoutesAdminOnly(t *testing.T) {
	got, admin, ok := stellarSSEAudienceFromData(store.StellarNotification{UserID: "system"})
	if !ok || !admin || got != "" {
		t.Errorf("system UserID should yield admin-only audience, got (%q,%v,%v)", got, admin, ok)
	}
}

func TestStellarSSEAudienceFromData_MapStringString(t *testing.T) {
	// The map[string]string branch is used by ad-hoc events that carry a
	// userId or userID key alongside their payload.
	tests := []struct {
		name string
		data map[string]string
		want string
	}{
		{"userId key", map[string]string{"userId": "u1"}, "u1"},
		{"userID key", map[string]string{"userID": "u2"}, "u2"},
		{"userId preferred over userID", map[string]string{"userId": "u1", "userID": "u2"}, "u1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, admin, ok := stellarSSEAudienceFromData(tt.data)
			if !ok || admin || got != tt.want {
				t.Errorf("got (%q,%v,%v), want (%q,false,true)", got, admin, ok, tt.want)
			}
		})
	}
}

func TestStellarSSEAudienceFromData_MapInterface(t *testing.T) {
	tests := []struct {
		name string
		data map[string]interface{}
		want string
	}{
		{"string userId", map[string]interface{}{"userId": "u1"}, "u1"},
		{"string userID", map[string]interface{}{"userID": "u2"}, "u2"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, admin, ok := stellarSSEAudienceFromData(tt.data)
			if !ok || admin || got != tt.want {
				t.Errorf("got (%q,%v,%v), want (%q,false,true)", got, admin, ok, tt.want)
			}
		})
	}
}

func TestStellarSSEAudienceFromData_MapInterfaceNonStringUserIDRejected(t *testing.T) {
	// If userId/userID isn't a string, we must NOT synthesize an audience —
	// broadcasting to a wrong user would leak data.
	tests := []interface{}{
		map[string]interface{}{"userId": 42},                    // int
		map[string]interface{}{"userId": nil},                   // nil interface
		map[string]interface{}{"userID": []string{"a"}},         // slice
		map[string]interface{}{"unrelated": "x"},                // no userId keys
		map[string]interface{}{"userid": "wrongcase-key-name"},  // lowercase key not honored
	}
	for i, d := range tests {
		got, admin, ok := stellarSSEAudienceFromData(d)
		if ok || admin || got != "" {
			t.Errorf("case %d: expected empty audience, got (%q,%v,%v)", i, got, admin, ok)
		}
	}
}

func TestStellarSSEAudienceFromData_UnknownTypeReturnsNoAudience(t *testing.T) {
	// Unrecognized payloads (nil, ints, string, arbitrary struct) must
	// return the "no audience" tuple so the broadcaster can decide what to
	// do — never fall through to a default user.
	cases := []interface{}{
		nil,
		42,
		"hello",
		struct{ UserID string }{UserID: "u1"}, // anonymous struct not in switch
	}
	for i, c := range cases {
		got, admin, ok := stellarSSEAudienceFromData(c)
		if ok || admin || got != "" {
			t.Errorf("case %d (%T): expected empty audience, got (%q,%v,%v)", i, c, got, admin, ok)
		}
	}
}
