package smolvm

import (
	"errors"
	"fmt"
)

// Error is the base type for all smolvm SDK errors.
//
// Use errors.As to inspect or errors.Is with the sentinel values
// (ErrNotFound, ErrConflict, ErrBadRequest, ErrTimeout, ErrInternal,
// ErrConnection) to handle specific cases:
//
//	if errors.Is(err, smolvm.ErrNotFound) { ... }
type Error struct {
	Message    string
	Code       string
	StatusCode int
	// kind is the sentinel error this Error category matches.
	kind error
}

func (e *Error) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("smolvm: %s (%s)", e.Message, e.Code)
	}
	return "smolvm: " + e.Message
}

// Is reports whether target matches the sentinel kind for this error.
func (e *Error) Is(target error) bool {
	return target != nil && e.kind != nil && target == e.kind
}

// Sentinel errors. Use errors.Is(err, ErrNotFound) etc. to match.
var (
	ErrNotFound   = errors.New("smolvm: not found")
	ErrConflict   = errors.New("smolvm: conflict")
	ErrBadRequest = errors.New("smolvm: bad request")
	ErrTimeout    = errors.New("smolvm: timeout")
	ErrInternal   = errors.New("smolvm: internal server error")
	ErrConnection = errors.New("smolvm: connection error")
)

// NewNotFoundError builds a 404-class error.
func NewNotFoundError(message string) *Error {
	return &Error{Message: message, Code: "NOT_FOUND", StatusCode: 404, kind: ErrNotFound}
}

// NewConflictError builds a 409-class error.
func NewConflictError(message string) *Error {
	return &Error{Message: message, Code: "CONFLICT", StatusCode: 409, kind: ErrConflict}
}

// NewBadRequestError builds a 400-class error.
func NewBadRequestError(message string) *Error {
	return &Error{Message: message, Code: "BAD_REQUEST", StatusCode: 400, kind: ErrBadRequest}
}

// NewTimeoutError builds a timeout error (408 or client-side).
func NewTimeoutError(message string) *Error {
	return &Error{Message: message, Code: "TIMEOUT", StatusCode: 408, kind: ErrTimeout}
}

// NewInternalError builds a 5xx-class error.
func NewInternalError(message string) *Error {
	return &Error{Message: message, Code: "INTERNAL_ERROR", StatusCode: 500, kind: ErrInternal}
}

// NewConnectionError builds a network/transport error.
func NewConnectionError(message string) *Error {
	return &Error{Message: message, Code: "CONNECTION_ERROR", StatusCode: 0, kind: ErrConnection}
}

// ParseAPIError maps an HTTP status + decoded body into a typed *Error.
func ParseAPIError(statusCode int, body ApiErrorResponse) *Error {
	message := body.Error
	if message == "" {
		message = fmt.Sprintf("HTTP %d", statusCode)
	}
	switch {
	case statusCode == 400:
		return NewBadRequestError(message)
	case statusCode == 404:
		return NewNotFoundError(message)
	case statusCode == 408:
		return NewTimeoutError(message)
	case statusCode == 409:
		return NewConflictError(message)
	case statusCode >= 500:
		return NewInternalError(message)
	default:
		code := body.Code
		if code == "" {
			code = "UNKNOWN"
		}
		return &Error{Message: message, Code: code, StatusCode: statusCode}
	}
}

// ExecutionError is returned from ExecResult.AssertSuccess when the command
// exited non-zero. It is distinct from server-side *Error values.
type ExecutionError struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

func (e *ExecutionError) Error() string {
	return fmt.Sprintf("smolvm: command failed with exit code %d", e.ExitCode)
}
