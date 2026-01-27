"""Integration tests that require a running smolvm server.

Run with: pytest --integration
"""

import pytest

from smolvm import (
    Sandbox,
    SandboxConfig,
    SandboxState,
    quick_exec,
    quick_run,
    with_sandbox,
)
from smolvm.presets import python_sandbox, node_sandbox


pytestmark = pytest.mark.integration


@pytest.fixture
def sandbox_name(request):
    """Generate a unique sandbox name for each test."""
    import time
    return f"test-{request.node.name}-{int(time.time() * 1000)}"


class TestQuickHelpers:
    @pytest.mark.asyncio
    async def test_quick_exec(self):
        result = await quick_exec(["echo", "hello"])
        assert result.exit_code == 0
        assert "hello" in result.stdout

    @pytest.mark.asyncio
    async def test_quick_exec_with_env(self):
        result = await quick_exec(
            ["sh", "-c", "echo $TEST_VAR"],
            env={"TEST_VAR": "test_value"},
        )
        assert result.exit_code == 0
        assert "test_value" in result.stdout

    @pytest.mark.asyncio
    async def test_quick_run(self):
        result = await quick_run(
            image="alpine:latest",
            command=["echo", "hello from container"],
        )
        assert result.exit_code == 0
        assert "hello from container" in result.stdout


class TestSandboxLifecycle:
    @pytest.mark.asyncio
    async def test_create_start_stop_delete(self, sandbox_name):
        config = SandboxConfig(name=sandbox_name)
        sandbox = Sandbox(config)

        try:
            # Create and start
            await sandbox.start()
            assert sandbox.is_started
            assert sandbox.state == SandboxState.RUNNING

            # Run a command
            result = await sandbox.exec(["echo", "test"])
            assert result.exit_code == 0

            # Stop
            await sandbox.stop()
            assert not sandbox.is_started

        finally:
            await sandbox.delete()
            await sandbox.close()

    @pytest.mark.asyncio
    async def test_context_manager(self, sandbox_name):
        config = SandboxConfig(name=sandbox_name)

        async with Sandbox(config) as sandbox:
            await sandbox.start()
            result = await sandbox.exec(["echo", "context manager"])
            assert "context manager" in result.stdout
        # Sandbox is automatically stopped and deleted

    @pytest.mark.asyncio
    async def test_with_sandbox_helper(self, sandbox_name):
        config = SandboxConfig(name=sandbox_name)

        async with with_sandbox(config) as sandbox:
            result = await sandbox.exec(["uname", "-a"])
            assert result.exit_code == 0
            assert "Linux" in result.stdout


class TestExecution:
    @pytest.mark.asyncio
    async def test_exec_with_workdir(self, sandbox_name):
        config = SandboxConfig(name=sandbox_name)

        async with with_sandbox(config) as sandbox:
            result = await sandbox.exec(["pwd"], workdir="/tmp")
            assert "/tmp" in result.stdout

    @pytest.mark.asyncio
    async def test_exec_failure(self, sandbox_name):
        config = SandboxConfig(name=sandbox_name)

        async with with_sandbox(config) as sandbox:
            result = await sandbox.exec(["sh", "-c", "exit 42"])
            assert result.exit_code == 42
            assert not result.success


class TestContainers:
    @pytest.mark.asyncio
    async def test_run_python(self, sandbox_name):
        config = SandboxConfig(name=sandbox_name)

        async with with_sandbox(config) as sandbox:
            result = await sandbox.run(
                image="python:3.12-alpine",
                command=["python", "-c", "print('hello')"],
            )
            assert result.exit_code == 0
            assert "hello" in result.stdout

    @pytest.mark.asyncio
    async def test_run_with_env(self, sandbox_name):
        config = SandboxConfig(name=sandbox_name)

        async with with_sandbox(config) as sandbox:
            result = await sandbox.run(
                image="alpine:latest",
                command=["sh", "-c", "echo $MY_VAR"],
                env={"MY_VAR": "my_value"},
            )
            assert result.exit_code == 0
            assert "my_value" in result.stdout


class TestPresets:
    @pytest.mark.asyncio
    async def test_python_sandbox(self):
        result = await python_sandbox("print('python preset')")
        assert result.exit_code == 0
        assert "python preset" in result.stdout

    @pytest.mark.asyncio
    async def test_node_sandbox(self):
        result = await node_sandbox("console.log('node preset')")
        assert result.exit_code == 0
        assert "node preset" in result.stdout
