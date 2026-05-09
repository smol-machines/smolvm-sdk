package smolvm

// ExecResult is a friendly wrapper around ExecResponse with helper methods.
type ExecResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

// newExecResult adapts the raw API response.
func newExecResult(r *ExecResponse) *ExecResult {
	return &ExecResult{
		ExitCode: r.ExitCode,
		Stdout:   r.Stdout,
		Stderr:   r.Stderr,
	}
}

// Success reports whether the command exited with code 0.
func (r *ExecResult) Success() bool { return r.ExitCode == 0 }

// Output returns stdout and stderr concatenated with a single newline
// between them when both are non-empty.
func (r *ExecResult) Output() string {
	if r.Stdout != "" && r.Stderr != "" {
		return r.Stdout + "\n" + r.Stderr
	}
	if r.Stdout != "" {
		return r.Stdout
	}
	return r.Stderr
}

// AssertSuccess returns r when the command succeeded, or an *ExecutionError
// otherwise. This makes one-liner pipelines ergonomic:
//
//	out, err := machine.Exec(ctx, []string{"true"})
//	if err != nil { return err }
//	if _, err := out.AssertSuccess(); err != nil { return err }
func (r *ExecResult) AssertSuccess() (*ExecResult, error) {
	if r.Success() {
		return r, nil
	}
	return nil, &ExecutionError{
		ExitCode: r.ExitCode,
		Stdout:   r.Stdout,
		Stderr:   r.Stderr,
	}
}
