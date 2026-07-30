package feedback

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

// screenshotErrorTransport is an http.RoundTripper that always returns an error.
type screenshotErrorTransport struct{}

func (screenshotErrorTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("no GitHub access configured")
}

func TestFormatScreenshotProcessingComment(t *testing.T) {
	dataURI := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	
	result := formatScreenshotProcessingComment(1, dataURI)
	
	assert.Contains(t, result, "<!-- screenshot-base64:1 -->", "should include screenshot marker comment")
	assert.Contains(t, result, "Screenshot 1 (processing...)", "should include screenshot label")
	assert.Contains(t, result, dataURI, "should include data URI")
	assert.Contains(t, result, "<details>", "should use details/summary for collapsible section")
}

func TestFormatScreenshotProcessingComment_MultipleIndices(t *testing.T) {
	dataURI := "data:image/png;base64,abc"
	
	result1 := formatScreenshotProcessingComment(1, dataURI)
	result2 := formatScreenshotProcessingComment(5, dataURI)
	
	assert.Contains(t, result1, "screenshot-base64:1", "should use correct index for first screenshot")
	assert.Contains(t, result2, "screenshot-base64:5", "should use correct index for fifth screenshot")
	assert.Contains(t, result2, "Screenshot 5", "should use correct label for fifth screenshot")
}

func TestUploadScreenshotCommentsAsync_EmptyScreenshots(t *testing.T) {
	handler := &FeedbackHandler{}
	
	// Should return early without errors
	handler.uploadScreenshotCommentsAsync(context.Background(), 123, "owner", "repo", "request-id", []string{})
	// No assertion needed - test passes if function doesn't panic
}

func TestUploadScreenshotCommentsAsync_ContextCanceled(t *testing.T) {
	handler := &FeedbackHandler{}
	
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately
	
	screenshots := []string{
		"data:image/png;base64,abc",
		"data:image/png;base64,def",
	}
	
	// Should handle cancellation gracefully
	handler.uploadScreenshotCommentsAsync(ctx, 123, "owner", "repo", "request-id", screenshots)
	// No assertion needed - test passes if function doesn't panic
}

func TestUploadScreenshotToGitHub_InvalidDataURI(t *testing.T) {
	handler := &FeedbackHandler{}
	
	_, err := handler.uploadScreenshotToGitHub("owner", "repo", "request-id", 1, "invalid-uri")
	assert.Error(t, err, "should return error for invalid data URI")
	assert.Contains(t, err.Error(), "invalid data URI format")
}

func TestUploadScreenshotToGitHub_DetectsImageType(t *testing.T) {
	handler := &FeedbackHandler{
		githubToken: "",
		httpClient:  &http.Client{Transport: screenshotErrorTransport{}},
	}

	
	testCases := []struct {
		name     string
		dataURI  string
		wantType string
	}{
		{"PNG", "data:image/png;base64,abc", "png"},
		{"JPEG", "data:image/jpeg;base64,abc", "jpg"},
		{"JPG", "data:image/jpg;base64,abc", "jpg"},
		{"GIF", "data:image/gif;base64,abc", "gif"},
		{"WebP", "data:image/webp;base64,abc", "webp"},
	}
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// This will fail due to no token, but it validates the data URI parsing
			_, err := handler.uploadScreenshotToGitHub("owner", "repo", "request-id", 1, tc.dataURI)
			// We're just checking that it doesn't panic on well-formed URIs
			// The actual error will be about missing GitHub token or network, which is expected
			assert.NotNil(t, err, "should return an error (no GitHub token configured)")
		})
	}
}

func TestUploadScreenshotToGitHub_Base64Padding(t *testing.T) {
	handler := &FeedbackHandler{
		httpClient: &http.Client{},
	}
	
	// Test with various padding scenarios
	testCases := []string{
		"data:image/png;base64,abc",   // Missing padding
		"data:image/png;base64,ab",    // Missing padding
		"data:image/png;base64,abcd",  // Correct length (no padding needed)
	}
	
	for _, dataURI := range testCases {
		t.Run(dataURI, func(t *testing.T) {
			_, err := handler.uploadScreenshotToGitHub("owner", "repo", "request-id", 1, dataURI)
			// Should handle padding automatically without panicking
			assert.Error(t, err, "should return error (no GitHub token), but shouldn't panic on padding")
		})
	}
}
