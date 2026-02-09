"""Integration tests for Container API.

Run with: pytest --integration tests/test_container.py
"""

import hashlib
import time

import pytest

from smolvm import Sandbox, SandboxConfig
from smolvm.types import ContainerOptions, ContainerState


pytestmark = pytest.mark.integration

TEST_IMAGE = "alpine:latest"


def unique_sandbox_name(prefix: str = "test") -> str:
    """Generate a unique sandbox name for testing.

    Uses hash + timestamp to keep names short (Unix socket path limit).
    """
    test_hash = hashlib.md5(prefix.encode()).hexdigest()[:6]
    return f"c-{test_hash}-{int(time.time() * 1000) % 100000}"


async def safe_delete_container(sandbox: Sandbox, container_id: str) -> None:
    """Safely stop and delete a container."""
    try:
        await sandbox.stop_container(container_id)
    except Exception:
        pass
    try:
        await sandbox.delete_container(container_id, force=True)
    except Exception:
        pass


class TestContainerLifecycle:
    """Tests for container lifecycle operations."""

    @pytest.fixture(autouse=True)
    async def setup_sandbox(self):
        """Create a sandbox for container tests."""
        name = unique_sandbox_name("lifecycle")
        config = SandboxConfig(name=name)
        self.sandbox = Sandbox(config)
        await self.sandbox.start()
        await self.sandbox.pull_image(TEST_IMAGE)

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
    async def test_create_container(self):
        """Test creating a container with correct properties."""
        options = ContainerOptions(
            image=TEST_IMAGE,
            command=["sleep", "300"],
        )
        container = await self.sandbox.create_container(options)

        try:
            assert container.id is not None
            assert container.id.startswith("smolvm-")
            assert container.image == TEST_IMAGE
            assert container.command == ["sleep", "300"]
            assert container.state in [ContainerState.CREATED, ContainerState.RUNNING]
            assert container.created_at > 0
        finally:
            await safe_delete_container(self.sandbox, container.id)

    @pytest.mark.asyncio
    async def test_list_containers(self):
        """Test listing containers in a sandbox."""
        options = ContainerOptions(image=TEST_IMAGE, command=["sleep", "300"])
        container1 = await self.sandbox.create_container(options)
        container2 = await self.sandbox.create_container(options)

        try:
            containers = await self.sandbox.list_containers()
            ids = [c.id for c in containers]
            assert container1.id in ids
            assert container2.id in ids
        finally:
            await safe_delete_container(self.sandbox, container1.id)
            await safe_delete_container(self.sandbox, container2.id)

    @pytest.mark.asyncio
    async def test_stop_container(self):
        """Test stopping a running container."""
        options = ContainerOptions(image=TEST_IMAGE, command=["sleep", "300"])
        container = await self.sandbox.create_container(options)

        try:
            await self.sandbox.stop_container(container.id)

            containers = await self.sandbox.list_containers()
            found = next((c for c in containers if c.id == container.id), None)
            assert found is not None
            assert found.state == ContainerState.STOPPED
        finally:
            await safe_delete_container(self.sandbox, container.id)

    @pytest.mark.asyncio
    async def test_delete_stopped_container(self):
        """Test deleting a stopped container."""
        options = ContainerOptions(image=TEST_IMAGE, command=["sleep", "300"])
        container = await self.sandbox.create_container(options)
        container_id = container.id

        await self.sandbox.stop_container(container_id)
        await self.sandbox.delete_container(container_id)

        containers = await self.sandbox.list_containers()
        found = next((c for c in containers if c.id == container_id), None)
        assert found is None

    @pytest.mark.asyncio
    async def test_force_delete_running_container(self):
        """Test force deleting a running container."""
        options = ContainerOptions(image=TEST_IMAGE, command=["sleep", "300"])
        container = await self.sandbox.create_container(options)
        container_id = container.id

        await self.sandbox.delete_container(container_id, force=True)

        containers = await self.sandbox.list_containers()
        found = next((c for c in containers if c.id == container_id), None)
        assert found is None


class TestContainerExecution:
    """Tests for executing commands in containers."""

    @pytest.fixture(autouse=True)
    async def setup_sandbox(self):
        """Create a sandbox for container exec tests."""
        name = unique_sandbox_name("exec")
        config = SandboxConfig(name=name)
        self.sandbox = Sandbox(config)
        await self.sandbox.start()
        await self.sandbox.pull_image(TEST_IMAGE)

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
    async def test_exec_command(self):
        """Test executing a command in a container."""
        options = ContainerOptions(image=TEST_IMAGE, command=["sleep", "300"])
        container = await self.sandbox.create_container(options)

        try:
            result = await self.sandbox.exec_container(
                container.id, ["echo", "hello from container"]
            )
            assert result.stdout.strip() == "hello from container"
            assert result.exit_code == 0
        finally:
            await safe_delete_container(self.sandbox, container.id)

    @pytest.mark.asyncio
    async def test_exec_capture_exit_codes(self):
        """Test capturing exit codes from container exec."""
        options = ContainerOptions(image=TEST_IMAGE, command=["sleep", "300"])
        container = await self.sandbox.create_container(options)

        try:
            success = await self.sandbox.exec_container(container.id, ["true"])
            assert success.exit_code == 0
            assert success.success is True

            fail = await self.sandbox.exec_container(container.id, ["false"])
            assert fail.exit_code == 1
            assert fail.success is False
        finally:
            await safe_delete_container(self.sandbox, container.id)

    @pytest.mark.asyncio
    async def test_exec_capture_stderr(self):
        """Test capturing stderr from container exec."""
        options = ContainerOptions(image=TEST_IMAGE, command=["sleep", "300"])
        container = await self.sandbox.create_container(options)

        try:
            result = await self.sandbox.exec_container(
                container.id, ["sh", "-c", "echo error >&2"]
            )
            assert result.stderr.strip() == "error"
        finally:
            await safe_delete_container(self.sandbox, container.id)

    @pytest.mark.asyncio
    async def test_exec_with_env_and_workdir(self):
        """Test exec with environment variables and working directory."""
        options = ContainerOptions(image=TEST_IMAGE, command=["sleep", "300"])
        container = await self.sandbox.create_container(options)

        try:
            # Test env vars
            result = await self.sandbox.exec_container(
                container.id,
                ["sh", "-c", "echo $TEST_VAR"],
                env={"TEST_VAR": "test-value"},
            )
            assert result.stdout.strip() == "test-value"

            # Test workdir
            result = await self.sandbox.exec_container(
                container.id, ["pwd"], workdir="/tmp"
            )
            assert result.stdout.strip() == "/tmp"
        finally:
            await safe_delete_container(self.sandbox, container.id)
