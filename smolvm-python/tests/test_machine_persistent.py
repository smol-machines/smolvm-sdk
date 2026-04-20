"""Integration tests for MicroVM API.

Run with: pytest --integration tests/test_machine.py
"""

import hashlib
import time

import pytest

from smolvm import SmolvmClient
from smolvm.errors import NotFoundError, ConflictError
from smolvm.types import MachineState


pytestmark = pytest.mark.integration


def unique_machine_name(prefix: str = "vm") -> str:
    """Generate a unique machine name for testing.

    Note: Names must be short enough that the socket path
    ~/Library/Caches/smolvm/vms/{name}/agent.sock stays under
    104 bytes (Unix domain socket limit on macOS).
    """
    test_hash = hashlib.md5(prefix.encode()).hexdigest()[:6]
    return f"t-{test_hash}-{int(time.time() * 1000) % 100000}"


@pytest.fixture
async def client():
    """Create a client for testing."""
    async with SmolvmClient() as c:
        yield c


class MachineTracker:
    """Track machines for cleanup."""

    def __init__(self, client: SmolvmClient):
        self.client = client
        self.machines: list[str] = []

    def track(self, name: str) -> None:
        self.machines.append(name)

    async def cleanup(self) -> None:
        for name in self.machines:
            try:
                await self.client.stop_machine(name)
            except Exception:
                pass
            try:
                await self.client.delete_machine(name)
            except Exception:
                pass
        self.machines = []


@pytest.fixture
async def tracker(client):
    """Create a tracker for test cleanup."""
    t = MachineTracker(client)
    yield t
    await t.cleanup()


class TestMachineLifecycle:
    @pytest.mark.asyncio
    async def test_create_machine(self, client, tracker):
        """Test creating a machine with default and custom resources."""
        # Default resources
        name1 = unique_machine_name("default")
        tracker.track(name1)
        info = await client.create_machine(name1)
        assert info.name == name1
        assert info.state == MachineState.CREATED
        assert info.cpus == 1
        assert info.memory_mb == 512

        # Custom resources
        name2 = unique_machine_name("custom")
        tracker.track(name2)
        info = await client.create_machine(name2, cpus=2, memory_mb=1024)
        assert info.cpus == 2
        assert info.memory_mb == 1024

    @pytest.mark.asyncio
    async def test_reject_duplicate_names(self, client, tracker):
        """Test that duplicate machine names are rejected."""
        name = unique_machine_name("dup")
        tracker.track(name)

        await client.create_machine(name)
        with pytest.raises(ConflictError):
            await client.create_machine(name)

    @pytest.mark.asyncio
    async def test_list_machines(self, client, tracker):
        """Test listing machines."""
        name = unique_machine_name("list")
        tracker.track(name)

        await client.create_machine(name)
        machines = await client.list_machines()

        found = next((vm for vm in machines if vm.name == name), None)
        assert found is not None

    @pytest.mark.asyncio
    async def test_get_nonexistent_machine(self, client):
        """Test getting a non-existent machine returns 404."""
        with pytest.raises(NotFoundError):
            await client.get_machine("nonexistent-12345")

    @pytest.mark.asyncio
    async def test_start_and_stop_machine(self, client, tracker):
        """Test starting and stopping a machine, including idempotent operations."""
        name = unique_machine_name("startstop")
        tracker.track(name)

        await client.create_machine(name)

        # Start
        info = await client.start_machine(name)
        assert info.state == MachineState.RUNNING
        assert info.pid is not None

        # Start again (idempotent)
        info = await client.start_machine(name)
        assert info.state == MachineState.RUNNING

        # Stop
        info = await client.stop_machine(name)
        assert info.state == MachineState.STOPPED

        # Stop again (idempotent)
        info = await client.stop_machine(name)
        assert info.state == MachineState.STOPPED

    @pytest.mark.asyncio
    async def test_delete_machine(self, client):
        """Test deleting a machine (stopped and running)."""
        # Delete stopped
        name1 = unique_machine_name("del1")
        await client.create_machine(name1)
        await client.delete_machine(name1)
        with pytest.raises(NotFoundError):
            await client.get_machine(name1)

        # Delete running
        name2 = unique_machine_name("del2")
        await client.create_machine(name2)
        await client.start_machine(name2)
        await client.delete_machine(name2)
        with pytest.raises(NotFoundError):
            await client.get_machine(name2)


class TestMachineExecution:
    @pytest.mark.asyncio
    async def test_exec_command(self, client, tracker):
        """Test executing a command in a machine."""
        name = unique_machine_name("exec")
        tracker.track(name)

        await client.create_machine(name)
        await client.start_machine(name)

        result = await client.exec_machine(name, ["echo", "hello"])
        assert result["exit_code"] == 0
        assert result["stdout"].strip() == "hello"
        assert result["stderr"] == ""

    @pytest.mark.asyncio
    async def test_exec_capture_exit_codes(self, client, tracker):
        """Test capturing exit codes from machine exec."""
        name = unique_machine_name("exit")
        tracker.track(name)

        await client.create_machine(name)
        await client.start_machine(name)

        assert (await client.exec_machine(name, ["true"]))["exit_code"] == 0
        assert (await client.exec_machine(name, ["false"]))["exit_code"] == 1
        assert (await client.exec_machine(name, ["sh", "-c", "exit 42"]))["exit_code"] == 42

    @pytest.mark.asyncio
    async def test_exec_capture_stderr(self, client, tracker):
        """Test capturing stderr from machine exec."""
        name = unique_machine_name("stderr")
        tracker.track(name)

        await client.create_machine(name)
        await client.start_machine(name)

        result = await client.exec_machine(name, ["sh", "-c", "echo error >&2"])
        assert result["stdout"] == ""
        assert result["stderr"].strip() == "error"

    @pytest.mark.asyncio
    async def test_exec_with_env_and_workdir(self, client, tracker):
        """Test exec with environment variables and working directory."""
        name = unique_machine_name("envwd")
        tracker.track(name)

        await client.create_machine(name)
        await client.start_machine(name)

        # Env vars
        result = await client.exec_machine(
            name, ["sh", "-c", "echo $MY_VAR"], env={"MY_VAR": "test"}
        )
        assert result["stdout"].strip() == "test"

        # Workdir
        result = await client.exec_machine(name, ["pwd"], workdir="/tmp")
        assert result["stdout"].strip() == "/tmp"

    @pytest.mark.asyncio
    async def test_exec_in_stopped_machine_fails(self, client, tracker):
        """Test that exec fails on a stopped machine."""
        name = unique_machine_name("stopped")
        tracker.track(name)

        await client.create_machine(name)

        with pytest.raises(ConflictError):
            await client.exec_machine(name, ["echo", "hello"])
