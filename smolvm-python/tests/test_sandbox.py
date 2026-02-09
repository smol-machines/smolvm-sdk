"""Integration tests for Sandbox API.

Run with: pytest --integration tests/test_sandbox.py
"""

import hashlib
import time

import pytest

from smolvm import Sandbox, SandboxConfig, SandboxState, quick_exec, with_sandbox
from smolvm.errors import ConflictError, NotFoundError


pytestmark = pytest.mark.integration


def unique_sandbox_name(prefix: str = "test") -> str:
    """Generate a unique sandbox name for testing.

    Uses hash + timestamp to keep names short (Unix socket path limit).
    """
    test_hash = hashlib.md5(prefix.encode()).hexdigest()[:6]
    return f"s-{test_hash}-{int(time.time() * 1000) % 100000}"


class TestSandboxLifecycle:
    @pytest.mark.asyncio
    async def test_create_start_stop_delete(self):
        """Test full sandbox lifecycle."""
        name = unique_sandbox_name("lifecycle")
        config = SandboxConfig(name=name)
        sandbox = Sandbox(config)

        try:
            await sandbox.start()
            assert sandbox.is_started is True
            assert sandbox.state == SandboxState.RUNNING

            status = await sandbox.status()
            assert status.name == name
            assert status.state == SandboxState.RUNNING

            await sandbox.stop()
            assert sandbox.is_started is False

            await sandbox.delete()

            with pytest.raises(NotFoundError):
                await sandbox.status()
        finally:
            await sandbox.close()

    @pytest.mark.asyncio
    async def test_idempotent_start_and_stop(self):
        """Test that start/stop operations are idempotent."""
        name = unique_sandbox_name("idempotent")
        config = SandboxConfig(name=name)
        sandbox = Sandbox(config)

        try:
            await sandbox.start()
            await sandbox.start()  # Second start is no-op
            assert sandbox.is_started is True

            await sandbox.stop()
            await sandbox.stop()  # Second stop is no-op
            assert sandbox.is_started is False

            await sandbox.delete()
        finally:
            await sandbox.close()

    @pytest.mark.asyncio
    async def test_reject_duplicate_sandbox_names(self):
        """Test that duplicate sandbox names are rejected."""
        name = unique_sandbox_name("duplicate")
        config = SandboxConfig(name=name)
        sandbox1 = Sandbox(config)
        sandbox2 = Sandbox(config)

        try:
            await sandbox1.start()

            with pytest.raises(ConflictError):
                await sandbox2.start()
        finally:
            try:
                await sandbox1.stop()
            except Exception:
                pass
            try:
                await sandbox1.delete()
            except Exception:
                pass
            await sandbox1.close()
            await sandbox2.close()


class TestSandboxExecution:
    @pytest.fixture(autouse=True)
    async def setup_sandbox(self):
        """Create a sandbox for execution tests."""
        name = unique_sandbox_name("exec")
        config = SandboxConfig(name=name)
        self.sandbox = Sandbox(config)
        await self.sandbox.start()

        yield

        try:
            await self.sandbox.stop()
        except Exception:
            pass
        try:
            await self.sandbox.delete()
        except Exception:
            pass
        await self.sandbox.close()

    @pytest.mark.asyncio
    async def test_exec_simple_command(self):
        """Test executing a simple command."""
        result = await self.sandbox.exec(["echo", "hello world"])

        assert result.stdout.strip() == "hello world"
        assert result.stderr == ""
        assert result.exit_code == 0
        assert result.success is True

    @pytest.mark.asyncio
    async def test_exec_capture_exit_codes(self):
        """Test capturing various exit codes."""
        success = await self.sandbox.exec(["true"])
        assert success.exit_code == 0
        assert success.success is True

        fail = await self.sandbox.exec(["false"])
        assert fail.exit_code == 1
        assert fail.success is False

        custom = await self.sandbox.exec(["sh", "-c", "exit 42"])
        assert custom.exit_code == 42

    @pytest.mark.asyncio
    async def test_exec_capture_stderr(self):
        """Test capturing stderr."""
        result = await self.sandbox.exec(["sh", "-c", "echo error >&2"])

        assert result.stdout == ""
        assert result.stderr.strip() == "error"

    @pytest.mark.asyncio
    async def test_exec_with_env_and_workdir(self):
        """Test execution with environment variables and working directory."""
        # Test env vars
        result = await self.sandbox.exec(
            ["sh", "-c", "echo $VAR1-$VAR2"],
            env={"VAR1": "one", "VAR2": "two"},
        )
        assert result.stdout.strip() == "one-two"

        # Test workdir
        result = await self.sandbox.exec(["pwd"], workdir="/tmp")
        assert result.stdout.strip() == "/tmp"


class TestSandboxRun:
    """Tests for running commands in container images."""

    @pytest.fixture(autouse=True)
    async def setup_sandbox(self):
        """Create a sandbox for container run tests."""
        name = unique_sandbox_name("run")
        config = SandboxConfig(name=name)
        self.sandbox = Sandbox(config)
        await self.sandbox.start()
        await self.sandbox.pull_image("alpine:latest")

        yield

        try:
            await self.sandbox.stop()
        except Exception:
            pass
        try:
            await self.sandbox.delete()
        except Exception:
            pass
        await self.sandbox.close()

    @pytest.mark.asyncio
    async def test_run_command_in_container(self):
        """Test running a command in a container image."""
        result = await self.sandbox.run("alpine:latest", ["cat", "/etc/alpine-release"])

        assert result.exit_code == 0
        assert result.stdout.strip()  # Alpine version present

    @pytest.mark.asyncio
    async def test_run_with_env_vars(self):
        """Test passing environment variables to container run."""
        result = await self.sandbox.run(
            "alpine:latest",
            ["sh", "-c", "echo $CONTAINER_VAR"],
            env={"CONTAINER_VAR": "container-test"},
        )

        assert result.stdout.strip() == "container-test"


class TestHelperFunctions:
    @pytest.mark.asyncio
    async def test_with_sandbox_context_manager(self):
        """Test with_sandbox creates and cleans up automatically."""
        name = unique_sandbox_name("with-sandbox")
        config = SandboxConfig(name=name)

        async with with_sandbox(config) as sandbox:
            assert sandbox.is_started is True
            result = await sandbox.exec(["echo", "test"])
            assert result.stdout.strip() == "test"

        # Verify sandbox was deleted
        check_sandbox = Sandbox(config)
        try:
            with pytest.raises(NotFoundError):
                await check_sandbox.status()
        finally:
            await check_sandbox.close()

    @pytest.mark.asyncio
    async def test_quick_exec(self):
        """Test quick_exec helper."""
        result = await quick_exec(["echo", "quick"])
        assert result.stdout.strip() == "quick"
        assert result.exit_code == 0
