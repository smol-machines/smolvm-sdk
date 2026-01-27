"""Tests for error classes."""

import pytest

from smolvm.errors import (
    BadRequestError,
    ConflictError,
    ConnectionError,
    ExecutionError,
    InternalError,
    NotFoundError,
    SmolvmError,
    TimeoutError,
    parse_api_error,
)


class TestErrorHierarchy:
    def test_all_errors_inherit_from_base(self):
        errors = [
            ConnectionError("test"),
            TimeoutError("test"),
            NotFoundError("test"),
            ConflictError("test"),
            BadRequestError("test"),
            InternalError("test"),
            ExecutionError(1, "", ""),
        ]
        for error in errors:
            assert isinstance(error, SmolvmError)


class TestExecutionError:
    def test_creation(self):
        error = ExecutionError(exit_code=42, stdout="output", stderr="error")
        assert error.exit_code == 42
        assert error.stdout == "output"
        assert error.stderr == "error"
        assert "42" in str(error)


class TestParseApiError:
    def test_400(self):
        error = parse_api_error(400, {"error": "bad request"})
        assert isinstance(error, BadRequestError)
        assert "bad request" in str(error)

    def test_404(self):
        error = parse_api_error(404, {"error": "not found"})
        assert isinstance(error, NotFoundError)
        assert "not found" in str(error)

    def test_409(self):
        error = parse_api_error(409, {"error": "conflict"})
        assert isinstance(error, ConflictError)
        assert "conflict" in str(error)

    def test_500(self):
        error = parse_api_error(500, {"error": "internal error"})
        assert isinstance(error, InternalError)
        assert "internal error" in str(error)

    def test_502(self):
        # All 5xx errors map to InternalError
        error = parse_api_error(502, {"error": "bad gateway"})
        assert isinstance(error, InternalError)

    def test_unknown_status(self):
        error = parse_api_error(418, {"error": "teapot"})
        assert isinstance(error, SmolvmError)
        assert "teapot" in str(error)

    def test_missing_error_field(self):
        error = parse_api_error(404, {})
        assert isinstance(error, NotFoundError)
        assert "404" in str(error)
