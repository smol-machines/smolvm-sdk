package smolvm

import (
	"errors"
	"testing"
)

func TestParseAPIErrorByStatus(t *testing.T) {
	cases := []struct {
		status int
		want   error
	}{
		{400, ErrBadRequest},
		{404, ErrNotFound},
		{408, ErrTimeout},
		{409, ErrConflict},
		{500, ErrInternal},
		{503, ErrInternal},
	}
	for _, tc := range cases {
		err := ParseAPIError(tc.status, ApiErrorResponse{Error: "x"})
		if !errors.Is(err, tc.want) {
			t.Errorf("status %d: errors.Is(%v, %v) = false", tc.status, err, tc.want)
		}
	}
}

func TestErrorMessageIncludesCode(t *testing.T) {
	e := NewNotFoundError("machine 'foo' not found")
	if got := e.Error(); got != "smolvm: machine 'foo' not found (NOT_FOUND)" {
		t.Errorf("Error() = %q", got)
	}
}

func TestExecutionError(t *testing.T) {
	r := &ExecResult{ExitCode: 2, Stdout: "out", Stderr: "boom"}
	if _, err := r.AssertSuccess(); err == nil {
		t.Fatal("expected error")
	} else {
		var execErr *ExecutionError
		if !errors.As(err, &execErr) {
			t.Fatalf("expected *ExecutionError, got %T", err)
		}
		if execErr.ExitCode != 2 || execErr.Stderr != "boom" {
			t.Errorf("execErr: %+v", execErr)
		}
	}

	ok := &ExecResult{ExitCode: 0, Stdout: "ok"}
	if got, err := ok.AssertSuccess(); err != nil || got != ok {
		t.Errorf("unexpected: got=%v err=%v", got, err)
	}
}

func TestExecResultOutput(t *testing.T) {
	cases := []struct {
		name string
		r    ExecResult
		want string
	}{
		{"both", ExecResult{Stdout: "out", Stderr: "err"}, "out\nerr"},
		{"stdout only", ExecResult{Stdout: "out"}, "out"},
		{"stderr only", ExecResult{Stderr: "err"}, "err"},
		{"empty", ExecResult{}, ""},
	}
	for _, tc := range cases {
		if got := tc.r.Output(); got != tc.want {
			t.Errorf("%s: Output()=%q, want %q", tc.name, got, tc.want)
		}
	}
}
