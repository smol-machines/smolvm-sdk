"""Integration tests for MicroVM API.

Run with: pytest --integration tests/test_microvm.py
"""

import hashlib
import time

import pytest

from smolvm import SmolvmClient
from smolvm.errors import NotFoundError, ConflictError
from smolvm.types import MicrovmState


pytestmark = pytest.mark.integration


def unique_microvm_name(prefix: str = "vm") -> str:
    """Generate a unique microvm name for testing.

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


class MicrovmTracker:
    """Track microvms for cleanup."""

    def __init__(self, client: SmolvmClient):
        self.client = client
        self.microvms: list[str] = []

    def track(self, name: str) -> None:
        self.microvms.append(name)

    async def cleanup(self) -> None:
        for name in self.microvms:
            try:
                await self.client.stop_microvm(name)
            except Exception:
                pass
            try:
                await self.client.delete_microvm(name)
            except Exception:
                pass
        self.microvms = []


@pytest.fixture
async def tracker(client):
    """Create a tracker for test cleanup."""
    t = MicrovmTracker(client)
    yield t
    await t.cleanup()


class TestMicrovmLifecycle:
    @pytest.mark.asyncio
    async def test_create_microvm(self, client, tracker):
        """Test creating a microvm with default and custom resources."""
        # Default resources
        name1 = unique_microvm_name("default")
        tracker.track(name1)
        info = await client.create_microvm(name1)
        assert info.name == name1
        assert info.state == MicrovmState.CREATED
        assert info.cpus == 1
        assert info.memory_mb == 512

        # Custom resources
        name2 = unique_microvm_name("custom")
        tracker.track(name2)
        info = await client.create_microvm(name2, cpus=2, memory_mb=1024)
        assert info.cpus == 2
        assert info.memory_mb == 1024

    @pytest.mark.asyncio
    async def test_reject_duplicate_names(self, client, tracker):
        """Test that duplicate microvm names are rejected."""
        name = unique_microvm_name("dup")
        tracker.track(name)

        await client.create_microvm(name)
        with pytest.raises(ConflictError):
            await client.create_microvm(name)

    @pytest.mark.asyncio
    async def test_list_microvms(self, client, tracker):
        """Test listing microvms."""
        name = unique_microvm_name("list")
        tracker.track(name)

        await client.create_microvm(name)
        microvms = await client.list_microvms()

        found = next((vm for vm in microvms if vm.name == name), None)
        assert found is not None

    @pytest.mark.asyncio
    async def test_get_nonexistent_microvm(self, client):
        """Test getting a non-existent microvm returns 404."""
        with pytest.raises(NotFoundError):
            await client.get_microvm("nonexistent-12345")

    @pytest.mark.asyncio
    async def test_start_and_stop_microvm(self, client, tracker):
        """Test starting and stopping a microvm, including idempotent operations."""
        name = unique_microvm_name("startstop")
        tracker.track(name)

        await client.create_microvm(name)

        # Start
        info = await client.start_microvm(name)
        assert info.state == MicrovmState.RUNNING
        assert info.pid is not None

        # Start again (idempotent)
        info = await client.start_microvm(name)
        assert info.state == MicrovmState.RUNNING

        # Stop
        info = await client.stop_microvm(name)
        assert info.state == MicrovmState.STOPPED

        # Stop again (idempotent)
        info = await client.stop_microvm(name)
        assert info.state == MicrovmState.STOPPED

    @pytest.mark.asyncio
    async def test_delete_microvm(self, client):
        """Test deleting a microvm (stopped and running)."""
        # Delete stopped
        name1 = unique_microvm_name("del1")
        await client.create_microvm(name1)
        await client.delete_microvm(name1)
        with pytest.raises(NotFoundError):
            await client.get_microvm(name1)

        # Delete running
        name2 = unique_microvm_name("del2")
        await client.create_microvm(name2)
        await client.start_microvm(name2)
        await client.delete_microvm(name2)
        with pytest.raises(NotFoundError):
            await client.get_microvm(name2)


class TestMicrovmExecution:
    @pytest.mark.asyncio
    async def test_exec_command(self, client, tracker):
        """Test executing a command in a microvm."""
        name = unique_microvm_name("exec")
        tracker.track(name)

        await client.create_microvm(name)
        await client.start_microvm(name)

        result = await client.exec_microvm(name, ["echo", "hello"])
        assert result["exit_code"] == 0
        assert result["stdout"].strip() == "hello"
        assert result["stderr"] == ""

    @pytest.mark.asyncio
    async def test_exec_capture_exit_codes(self, client, tracker):
        """Test capturing exit codes from microvm exec."""
        name = unique_microvm_name("exit")
        tracker.track(name)

        await client.create_microvm(name)
        await client.start_microvm(name)

        assert (await client.exec_microvm(name, ["true"]))["exit_code"] == 0
        assert (await client.exec_microvm(name, ["false"]))["exit_code"] == 1
        assert (await client.exec_microvm(name, ["sh", "-c", "exit 42"]))["exit_code"] == 42

    @pytest.mark.asyncio
    async def test_exec_capture_stderr(self, client, tracker):
        """Test capturing stderr from microvm exec."""
        name = unique_microvm_name("stderr")
        tracker.track(name)

        await client.create_microvm(name)
        await client.start_microvm(name)

        result = await client.exec_microvm(name, ["sh", "-c", "echo error >&2"])
        assert result["stdout"] == ""
        assert result["stderr"].strip() == "error"

    @pytest.mark.asyncio
    async def test_exec_with_env_and_workdir(self, client, tracker):
        """Test exec with environment variables and working directory."""
        name = unique_microvm_name("envwd")
        tracker.track(name)

        await client.create_microvm(name)
        await client.start_microvm(name)

        # Env vars
        result = await client.exec_microvm(
            name, ["sh", "-c", "echo $MY_VAR"], env={"MY_VAR": "test"}
        )
        assert result["stdout"].strip() == "test"

        # Workdir
        result = await client.exec_microvm(name, ["pwd"], workdir="/tmp")
        assert result["stdout"].strip() == "/tmp"

    @pytest.mark.asyncio
    async def test_exec_in_stopped_microvm_fails(self, client, tracker):
        """Test that exec fails on a stopped microvm."""
        name = unique_microvm_name("stopped")
        tracker.track(name)

        await client.create_microvm(name)

        with pytest.raises(ConflictError):
            await client.exec_microvm(name, ["echo", "hello"])
