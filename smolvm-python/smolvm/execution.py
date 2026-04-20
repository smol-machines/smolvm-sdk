"""Execution result handling."""

from dataclasses import dataclass

from .errors import ExecutionError


@dataclass
class ExecResult:
    """Result of command execution."""

    exit_code: int
    stdout: str
    stderr: str

    @property
    def success(self) -> bool:
        """Whether the command exited successfully (exit code 0)."""
        return self.exit_code == 0

    @property
    def output(self) -> str:
        """Combined stdout and stderr output."""
        if self.stdout and self.stderr:
            return f"{self.stdout}\n{self.stderr}"
        return self.stdout or self.stderr

    def assert_success(self) -> "ExecResult":
        """
        Assert that the command succeeded (exit code 0).

        Raises ExecutionError if the command failed.
        Returns self for method chaining.
        """
        if not self.success:
            raise ExecutionError(self.exit_code, self.stdout, self.stderr)
        return self

    @classmethod
    def from_dict(cls, data: dict) -> "ExecResult":
        """Create ExecResult from API response dict."""
        return cls(
            exit_code=data["exitCode"],
            stdout=data.get("stdout", ""),
            stderr=data.get("stderr", ""),
        )

    def __repr__(self) -> str:
        status = "success" if self.success else f"failed({self.exit_code})"
        return f"ExecResult({status}, stdout={len(self.stdout)}b, stderr={len(self.stderr)}b)"
