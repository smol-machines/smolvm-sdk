"""Exception classes for the smolvm SDK."""


class SmolvmError(Exception):
    """Base exception for all smolvm errors."""

    pass


class ConnectionError(SmolvmError):
    """Failed to connect to the smolvm server."""

    pass


class TimeoutError(SmolvmError):
    """Request timed out."""

    pass


class NotFoundError(SmolvmError):
    """Resource not found (404)."""

    pass


class ConflictError(SmolvmError):
    """Resource conflict (409)."""

    pass


class BadRequestError(SmolvmError):
    """Invalid request (400)."""

    pass


class InternalError(SmolvmError):
    """Server internal error (500)."""

    pass


class ExecutionError(SmolvmError):
    """Command execution failed with non-zero exit code."""

    def __init__(self, exit_code: int, stdout: str, stderr: str):
        super().__init__(f"Command failed with exit code {exit_code}")
        self.exit_code = exit_code
        self.stdout = stdout
        self.stderr = stderr


def parse_api_error(status_code: int, error_body: dict) -> SmolvmError:
    """Parse an API error response into an appropriate exception."""
    message = error_body.get("error", f"HTTP {status_code}")

    if status_code == 400:
        return BadRequestError(message)
    elif status_code == 404:
        return NotFoundError(message)
    elif status_code == 409:
        return ConflictError(message)
    elif status_code >= 500:
        return InternalError(message)
    else:
        return SmolvmError(message)
