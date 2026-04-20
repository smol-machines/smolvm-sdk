"""Integration tests for Machine API.

Run with: pytest --integration tests/test_machine.py
"""

import hashlib
import time

import pytest

from smolvm import Machine, MachineConfig, MachineState, quick_exec, with_machine
from smolvm.errors import ConflictError, NotFoundError


pytestmark = pytest.mark.integration


def unique_machine_name(prefix: str = "test") -> str:
    """Generate a unique machine name for testing.

    Uses hash + timestamp to keep names short (Unix socket path limit).
    """
    test_hash = hashlib.md5(prefix.encode()).hexdigest()[:6]
    return f"s-{test_hash}-{int(time.time() * 1000) % 100000}"


class TestMachineLifecycle:
    @pytest.mark.asyncio
    async def test_create_start_stop_delete(self):
        """Test full machine lifecycle."""
        name = unique_machine_name("lifecycle")
        config = MachineConfig(name=name)
        machine = Machine(config)

        try:
            await machine.start()
            assert machine.is_started is True
            assert machine.state == MachineState.RUNNING

            status = await machine.status()
            assert status.name == name
            assert status.state == MachineState.RUNNING

            await machine.stop()
            assert machine.is_started is False

            await machine.delete()

            with pytest.raises(NotFoundError):
                await machine.status()
        finally:
            await machine.close()

    @pytest.mark.asyncio
    async def test_idempotent_start_and_stop(self):
        """Test that start/stop operations are idempotent."""
        name = unique_machine_name("idempotent")
        config = MachineConfig(name=name)
        machine = Machine(config)

        try:
            await machine.start()
            await machine.start()  # Second start is no-op
            assert machine.is_started is True

            await machine.stop()
            await machine.stop()  # Second stop is no-op
            assert machine.is_started is False

            await machine.delete()
        finally:
            await machine.close()

    @pytest.mark.asyncio
    async def test_reject_duplicate_machine_names(self):
        """Test that duplicate machine names are rejected."""
        name = unique_machine_name("duplicate")
        config = MachineConfig(name=name)
        machine1 = Machine(config)
        machine2 = Machine(config)

        try:
            await machine1.start()

            with pytest.raises(ConflictError):
                await machine2.start()
        finally:
            try:
                await machine1.stop()
            except Exception:
                pass
            try:
                await machine1.delete()
            except Exception:
                pass
            await machine1.close()
            await machine2.close()


class TestMachineExecution:
    @pytest.fixture(autouse=True)
    async def setup_machine(self):
        """Create a machine for execution tests."""
        name = unique_machine_name("exec")
        config = MachineConfig(name=name)
        self.machine = Machine(config)
        await self.machine.start()

        yield

        try:
            await self.machine.stop()
        except Exception:
            pass
        try:
            await self.machine.delete()
        except Exception:
            pass
        await self.machine.close()

    @pytest.mark.asyncio
    async def test_exec_simple_command(self):
        """Test executing a simple command."""
        result = await self.machine.exec(["echo", "hello world"])

        assert result.stdout.strip() == "hello world"
        assert result.stderr == ""
        assert result.exit_code == 0
        assert result.success is True

    @pytest.mark.asyncio
    async def test_exec_capture_exit_codes(self):
        """Test capturing various exit codes."""
        success = await self.machine.exec(["true"])
        assert success.exit_code == 0
        assert success.success is True

        fail = await self.machine.exec(["false"])
        assert fail.exit_code == 1
        assert fail.success is False

        custom = await self.machine.exec(["sh", "-c", "exit 42"])
        assert custom.exit_code == 42

    @pytest.mark.asyncio
    async def test_exec_capture_stderr(self):
        """Test capturing stderr."""
        result = await self.machine.exec(["sh", "-c", "echo error >&2"])

        assert result.stdout == ""
        assert result.stderr.strip() == "error"

    @pytest.mark.asyncio
    async def test_exec_with_env_and_workdir(self):
        """Test execution with environment variables and working directory."""
        # Test env vars
        result = await self.machine.exec(
            ["sh", "-c", "echo $VAR1-$VAR2"],
            env={"VAR1": "one", "VAR2": "two"},
        )
        assert result.stdout.strip() == "one-two"

        # Test workdir
        result = await self.machine.exec(["pwd"], workdir="/tmp")
        assert result.stdout.strip() == "/tmp"


class TestMachineRun:
    """Tests for running commands in container images."""

    @pytest.fixture(autouse=True)
    async def setup_machine(self):
        """Create a machine for container run tests."""
        name = unique_machine_name("run")
        config = MachineConfig(name=name)
        self.machine = Machine(config)
        await self.machine.start()
        await self.machine.pull_image("alpine:latest")

        yield

        try:
            await self.machine.stop()
        except Exception:
            pass
        try:
            await self.machine.delete()
        except Exception:
            pass
        await self.machine.close()

    @pytest.mark.asyncio
    async def test_run_command_in_container(self):
        """Test running a command in a container image."""
        result = await self.machine.run("alpine:latest", ["cat", "/etc/alpine-release"])

        assert result.exit_code == 0
        assert result.stdout.strip()  # Alpine version present

    @pytest.mark.asyncio
    async def test_run_with_env_vars(self):
        """Test passing environment variables to container run."""
        result = await self.machine.run(
            "alpine:latest",
            ["sh", "-c", "echo $CONTAINER_VAR"],
            env={"CONTAINER_VAR": "container-test"},
        )

        assert result.stdout.strip() == "container-test"


class TestHelperFunctions:
    @pytest.mark.asyncio
    async def test_with_machine_context_manager(self):
        """Test with_machine creates and cleans up automatically."""
        name = unique_machine_name("with-machine")
        config = MachineConfig(name=name)

        async with with_machine(config) as machine:
            assert machine.is_started is True
            result = await machine.exec(["echo", "test"])
            assert result.stdout.strip() == "test"

        # Verify machine was deleted
        check_machine = Machine(config)
        try:
            with pytest.raises(NotFoundError):
                await check_machine.status()
        finally:
            await check_machine.close()

    @pytest.mark.asyncio
    async def test_quick_exec(self):
        """Test quick_exec helper."""
        result = await quick_exec(["echo", "quick"])
        assert result.stdout.strip() == "quick"
        assert result.exit_code == 0
