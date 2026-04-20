"""Tests for ExecResult."""

import pytest

from smolvm.execution import ExecResult
from smolvm.errors import ExecutionError


class TestExecResult:
    def test_from_dict(self):
        data = {"exitCode": 0, "stdout": "hello\n", "stderr": ""}
        result = ExecResult.from_dict(data)
        assert result.exit_code == 0
        assert result.stdout == "hello\n"
        assert result.stderr == ""

    def test_from_dict_missing_output(self):
        data = {"exitCode": 1}
        result = ExecResult.from_dict(data)
        assert result.exit_code == 1
        assert result.stdout == ""
        assert result.stderr == ""

    def test_success_true(self):
        result = ExecResult(exit_code=0, stdout="ok", stderr="")
        assert result.success is True

    def test_success_false(self):
        result = ExecResult(exit_code=1, stdout="", stderr="error")
        assert result.success is False

    def test_output_both(self):
        result = ExecResult(exit_code=0, stdout="out", stderr="err")
        assert result.output == "out\nerr"

    def test_output_stdout_only(self):
        result = ExecResult(exit_code=0, stdout="out", stderr="")
        assert result.output == "out"

    def test_output_stderr_only(self):
        result = ExecResult(exit_code=0, stdout="", stderr="err")
        assert result.output == "err"

    def test_output_empty(self):
        result = ExecResult(exit_code=0, stdout="", stderr="")
        assert result.output == ""

    def test_assert_success_ok(self):
        result = ExecResult(exit_code=0, stdout="ok", stderr="")
        returned = result.assert_success()
        assert returned is result  # Returns self for chaining

    def test_assert_success_fails(self):
        result = ExecResult(exit_code=42, stdout="out", stderr="error msg")
        with pytest.raises(ExecutionError) as exc_info:
            result.assert_success()
        assert exc_info.value.exit_code == 42
        assert exc_info.value.stdout == "out"
        assert exc_info.value.stderr == "error msg"

    def test_repr_success(self):
        result = ExecResult(exit_code=0, stdout="hello", stderr="")
        assert "success" in repr(result)
        assert "5b" in repr(result)  # stdout length

    def test_repr_failure(self):
        result = ExecResult(exit_code=1, stdout="", stderr="error")
        assert "failed(1)" in repr(result)
