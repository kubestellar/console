package handlers

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsValidCronSchedule(t *testing.T) {
	tests := []struct {
		name     string
		schedule string
		wantOK   bool
	}{
		{
			name:     "ValidEveryMinute",
			schedule: "* * * * *",
			wantOK:   true,
		},
		{
			name:     "ValidSpecificTime",
			schedule: "0 12 * * *",
			wantOK:   true,
		},
		{
			name:     "ValidWithRanges",
			schedule: "0-30 9-17 * * 1-5",
			wantOK:   true,
		},
		{
			name:     "ValidWithStep",
			schedule: "*/15 * * * *",
			wantOK:   true,
		},
		{
			name:     "ValidWithComma",
			schedule: "0,30 * * * *",
			wantOK:   true,
		},
		{
			name:     "TooFewFields",
			schedule: "* * *",
			wantOK:   false,
		},
		{
			name:     "TooManyFields",
			schedule: "* * * * * *",
			wantOK:   false,
		},
		{
			name:     "InvalidCharacter",
			schedule: "* * @ * *",
			wantOK:   false,
		},
		{
			name:     "FieldTooLong",
			schedule: "* * * * " + string(make([]byte, maxCronFieldLen+1)),
			wantOK:   false,
		},
		{
			name:     "EmptyString",
			schedule: "",
			wantOK:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isValidCronSchedule(tt.schedule)
			assert.Equal(t, tt.wantOK, result)
		})
	}
}

func TestIsValidK8sName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantOK   bool
	}{
		{
			name:   "ValidLowercase",
			input:  "myresource",
			wantOK: true,
		},
		{
			name:   "ValidWithDashes",
			input:  "my-resource",
			wantOK: true,
		},
		{
			name:   "ValidWithDots",
			input:  "apps.v1",
			wantOK: true,
		},
		{
			name:   "ValidSingleChar",
			input:  "a",
			wantOK: true,
		},
		{
			name:   "ValidWithNumbers",
			input:  "app1",
			wantOK: true,
		},
		{
			name:   "ValidComplexName",
			input:  "kube-system.v1beta1",
			wantOK: true,
		},
		{
			name:   "TooLong",
			input:  string(make([]byte, MaxK8sNameLen+1)),
			wantOK: false,
		},
		{
			name:   "Uppercase",
			input:  "MyResource",
			wantOK: false,
		},
		{
			name:   "StartsWithDash",
			input:  "-resource",
			wantOK: false,
		},
		{
			name:   "EndsWithDash",
			input:  "resource-",
			wantOK: false,
		},
		{
			name:   "StartsWithDot",
			input:  ".resource",
			wantOK: false,
		},
		{
			name:   "EndsWithDot",
			input:  "resource.",
			wantOK: false,
		},
		{
			name:   "Underscore",
			input:  "my_resource",
			wantOK: false,
		},
		{
			name:   "EmptyString",
			input:  "",
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsValidK8sName(tt.input)
			assert.Equal(t, tt.wantOK, result)
		})
	}
}

func TestIsValidK8sVersion(t *testing.T) {
	tests := []struct {
		name    string
		version string
		wantOK  bool
	}{
		{
			name:    "ValidV1",
			version: "v1",
			wantOK:  true,
		},
		{
			name:    "ValidV2",
			version: "v2",
			wantOK:  true,
		},
		{
			name:    "ValidBeta",
			version: "v1beta1",
			wantOK:  true,
		},
		{
			name:    "ValidAlpha",
			version: "v1alpha1",
			wantOK:  true,
		},
		{
			name:    "ValidBeta2",
			version: "v2beta2",
			wantOK:  true,
		},
		{
			name:    "NoV",
			version: "1",
			wantOK:  false,
		},
		{
			name:    "Uppercase",
			version: "V1",
			wantOK:  false,
		},
		{
			name:    "NoNumber",
			version: "v",
			wantOK:  false,
		},
		{
			name:    "InvalidSuffix",
			version: "v1-beta",
			wantOK:  false,
		},
		{
			name:    "TooLong",
			version: string(make([]byte, MaxK8sNameLen+1)),
			wantOK:  false,
		},
		{
			name:    "EmptyString",
			version: "",
			wantOK:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsValidK8sVersion(tt.version)
			assert.Equal(t, tt.wantOK, result)
		})
	}
}

func TestMaxK8sNameLenConstant(t *testing.T) {
	// Verify the constant is defined and has the expected value
	assert.Equal(t, 253, MaxK8sNameLen)
}

func TestCronFieldPatternRegex(t *testing.T) {
	tests := []struct {
		name    string
		field   string
		wantOK  bool
	}{
		{
			name:   "Asterisk",
			field:  "*",
			wantOK: true,
		},
		{
			name:   "Number",
			field:  "5",
			wantOK: true,
		},
		{
			name:   "Range",
			field:  "1-5",
			wantOK: true,
		},
		{
			name:   "Step",
			field:  "*/5",
			wantOK: true,
		},
		{
			name:   "Comma",
			field:  "1,3,5",
			wantOK: true,
		},
		{
			name:   "InvalidChar",
			field:  "@",
			wantOK: false,
		},
		{
			name:   "Letter",
			field:  "a",
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := cronFieldPattern.MatchString(tt.field)
			assert.Equal(t, tt.wantOK, result)
		})
	}
}

func TestK8sNamePatternRegex(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		wantOK bool
	}{
		{
			name:   "SimpleName",
			input:  "apps",
			wantOK: true,
		},
		{
			name:   "WithDashes",
			input:  "kube-system",
			wantOK: true,
		},
		{
			name:   "WithDots",
			input:  "v1.beta1",
			wantOK: true,
		},
		{
			name:   "SingleChar",
			input:  "a",
			wantOK: true,
		},
		{
			name:   "Uppercase",
			input:  "Apps",
			wantOK: false,
		},
		{
			name:   "StartsWithDash",
			input:  "-apps",
			wantOK: false,
		},
		{
			name:   "EndsWithDash",
			input:  "apps-",
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := k8sNamePattern.MatchString(tt.input)
			assert.Equal(t, tt.wantOK, result)
		})
	}
}

func TestK8sVersionPatternRegex(t *testing.T) {
	tests := []struct {
		name    string
		version string
		wantOK  bool
	}{
		{
			name:    "V1",
			version: "v1",
			wantOK:  true,
		},
		{
			name:    "V1Beta1",
			version: "v1beta1",
			wantOK:  true,
		},
		{
			name:    "V1Alpha1",
			version: "v1alpha1",
			wantOK:  true,
		},
		{
			name:    "NoV",
			version: "1",
			wantOK:  false,
		},
		{
			name:    "Uppercase",
			version: "V1",
			wantOK:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := k8sVersionPattern.MatchString(tt.version)
			assert.Equal(t, tt.wantOK, result)
		})
	}
}
