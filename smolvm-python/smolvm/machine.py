"""High-level machine abstraction for managing microVM machines."""

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

from .client import SmolvmClient
from .execution import ExecResult
from .types import (
    ExecOptions,
    ImageInfo,
    MountInfo,
    MountSpec,
    PortSpec,
    ResourceSpec,
    MachineConfig,
    MachineInfo,
    MachineState,
)


class Machine:
    """High-level machine abstraction for managing microVM machines."""

    def __init__(self, config: MachineConfig):
        """
        Initialize a machine (does not create it yet).

        Use `Machine.create()` to create and start a machine in one step.

        Args:
            config: Machine configuration
        """
        self.name = config.name
        self.config = config
        self.client = SmolvmClient(config.server_url)
        self._info: Optional[MachineInfo] = None
        self._started = False

    @classmethod
    async def create(cls, config: MachineConfig) -> "Machine":
        """
        Create a new machine and start it.

        Args:
            config: Machine configuration

        Returns:
            A started Machine instance
        """
        machine = cls(config)
        await machine.start()
        return machine

    # =========================================================================
    # Lifecycle
    # =========================================================================

    async def start(self) -> None:
        """
        Create and start the machine.

        If the machine already exists, it will be started if not already running.
        """
        if self._started:
            return

        # Create the machine
        self._info = await self.client.create_machine(
            name=self.config.name,
            mounts=self.config.mounts or None,
            ports=self.config.ports or None,
            resources=self.config.resources,
        )

        # Start the machine
        self._info = await self.client.start_machine(self.name)
        self._started = True

    async def stop(self) -> None:
        """Stop the machine."""
        if not self._started:
            return

        self._info = await self.client.stop_machine(self.name)
        self._started = False

    async def delete(self) -> None:
        """Delete the machine."""
        await self.client.delete_machine(self.name)
        self._info = None
        self._started = False

    async def close(self) -> None:
        """Close the client connection."""
        await self.client.close()

    async def __aenter__(self) -> "Machine":
        return self

    async def __aexit__(self, *args: Any) -> None:
        try:
            await self.stop()
        except Exception:
            pass
        try:
            await self.delete()
        except Exception:
            pass
        await self.close()

    # =========================================================================
    # Status
    # =========================================================================

    async def status(self) -> MachineInfo:
        """Get the current machine status."""
        self._info = await self.client.get_machine(self.name)
        return self._info

    @property
    def is_started(self) -> bool:
        """Whether the machine has been started."""
        return self._started

    @property
    def state(self) -> Optional[MachineState]:
        """Get the current machine state."""
        return self._info.state if self._info else None

    @property
    def mounts(self) -> list[MountInfo]:
        """Get the machine mounts."""
        return self._info.mounts if self._info else []

    @property
    def info(self) -> Optional[MachineInfo]:
        """Get the raw machine info."""
        return self._info

    # =========================================================================
    # Execution
    # =========================================================================

    async def exec(
        self,
        command: list[str],
        env: Optional[dict[str, str]] = None,
        workdir: Optional[str] = None,
        timeout: Optional[int] = None,
    ) -> ExecResult:
        """
        Execute a command directly in the machine VM.

        Args:
            command: Command and arguments to execute
            env: Environment variables
            workdir: Working directory
            timeout: Timeout in seconds

        Returns:
            ExecResult with exit_code, stdout, stderr
        """
        response = await self.client.exec(
            self.name,
            command,
            env=env,
            workdir=workdir,
            timeout_secs=timeout,
        )
        return ExecResult.from_dict(response)

    async def run(
        self,
        image: str,
        command: list[str],
        env: Optional[dict[str, str]] = None,
        workdir: Optional[str] = None,
        timeout: Optional[int] = None,
    ) -> ExecResult:
        """
        Run a command in a container image within the machine.

        Args:
            image: OCI image reference (e.g., "python:3.12-alpine")
            command: Command and arguments to execute
            env: Environment variables
            workdir: Working directory
            timeout: Timeout in seconds

        Returns:
            ExecResult with exit_code, stdout, stderr
        """
        response = await self.client.run(
            self.name,
            image,
            command,
            env=env,
            workdir=workdir,
            timeout_secs=timeout,
        )
        return ExecResult.from_dict(response)

    # =========================================================================
    # Logs
    # =========================================================================

    async def logs(
        self,
        follow: bool = False,
        tail: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """
        Stream logs from the machine.

        Args:
            follow: Keep streaming new logs
            tail: Number of recent lines to return

        Yields:
            Log lines
        """
        async for line in self.client.stream_logs(self.name, follow=follow, tail=tail):
            yield line

    # =========================================================================
    # Images
    # =========================================================================

    async def list_images(self) -> list[ImageInfo]:
        """List all images in the machine."""
        return await self.client.list_images(self.name)

    async def pull_image(
        self, image: str, oci_platform: Optional[str] = None
    ) -> ImageInfo:
        """Pull an image into the machine."""
        return await self.client.pull_image(self.name, image, oci_platform)


# =============================================================================
# Helper Functions
# =============================================================================


@asynccontextmanager
async def with_machine(config: MachineConfig):
    """
    Create a machine, yield it, and clean up afterwards.

    This is the recommended way to use machines for short-lived tasks.

    Example:
        async with with_machine(MachineConfig(name="test")) as machine:
            result = await machine.exec(["echo", "hello"])
            print(result.stdout)
    """
    machine = await Machine.create(config)
    try:
        yield machine
    finally:
        try:
            await machine.stop()
        except Exception:
            pass
        try:
            await machine.delete()
        except Exception:
            pass
        await machine.close()


async def quick_exec(
    command: list[str],
    name: Optional[str] = None,
    server_url: str = "http://127.0.0.1:8080",
    mounts: Optional[list[MountSpec]] = None,
    env: Optional[dict[str, str]] = None,
    workdir: Optional[str] = None,
    timeout: Optional[int] = None,
) -> ExecResult:
    """
    Quick execution helper - creates a temporary machine, runs a command, and cleans up.

    Args:
        command: Command to execute
        name: Machine name (auto-generated if not provided)
        server_url: smolvm server URL
        mounts: Volume mounts
        env: Environment variables
        workdir: Working directory
        timeout: Timeout in seconds

    Returns:
        ExecResult
    """
    import time

    config = MachineConfig(
        name=name or f"quick-exec-{int(time.time() * 1000)}",
        server_url=server_url,
        mounts=mounts or [],
    )

    async with with_machine(config) as machine:
        return await machine.exec(command, env=env, workdir=workdir, timeout=timeout)


async def quick_run(
    image: str,
    command: list[str],
    name: Optional[str] = None,
    server_url: str = "http://127.0.0.1:8080",
    mounts: Optional[list[MountSpec]] = None,
    env: Optional[dict[str, str]] = None,
    workdir: Optional[str] = None,
    timeout: Optional[int] = None,
) -> ExecResult:
    """
    Quick run helper - creates a temporary machine, runs in an image, and cleans up.

    Args:
        image: OCI image reference
        command: Command to execute
        name: Machine name (auto-generated if not provided)
        server_url: smolvm server URL
        mounts: Volume mounts
        env: Environment variables
        workdir: Working directory
        timeout: Timeout in seconds

    Returns:
        ExecResult
    """
    import time

    config = MachineConfig(
        name=name or f"quick-run-{int(time.time() * 1000)}",
        server_url=server_url,
        mounts=mounts or [],
    )

    async with with_machine(config) as machine:
        return await machine.run(image, command, env=env, workdir=workdir, timeout=timeout)
