"""High-level sandbox abstraction for managing microVM sandboxes."""

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

from .client import SmolvmClient
from .execution import ExecResult
from .types import (
    ContainerInfo,
    ContainerOptions,
    ExecOptions,
    ImageInfo,
    MountInfo,
    MountSpec,
    PortSpec,
    ResourceSpec,
    SandboxConfig,
    SandboxInfo,
    SandboxState,
)


class Sandbox:
    """High-level sandbox abstraction for managing microVM sandboxes."""

    def __init__(self, config: SandboxConfig):
        """
        Initialize a sandbox (does not create it yet).

        Use `Sandbox.create()` to create and start a sandbox in one step.

        Args:
            config: Sandbox configuration
        """
        self.name = config.name
        self.config = config
        self.client = SmolvmClient(config.server_url)
        self._info: Optional[SandboxInfo] = None
        self._started = False

    @classmethod
    async def create(cls, config: SandboxConfig) -> "Sandbox":
        """
        Create a new sandbox and start it.

        Args:
            config: Sandbox configuration

        Returns:
            A started Sandbox instance
        """
        sandbox = cls(config)
        await sandbox.start()
        return sandbox

    # =========================================================================
    # Lifecycle
    # =========================================================================

    async def start(self) -> None:
        """
        Create and start the sandbox.

        If the sandbox already exists, it will be started if not already running.
        """
        if self._started:
            return

        # Create the sandbox
        self._info = await self.client.create_sandbox(
            name=self.config.name,
            mounts=self.config.mounts or None,
            ports=self.config.ports or None,
            resources=self.config.resources,
        )

        # Start the sandbox
        self._info = await self.client.start_sandbox(self.name)
        self._started = True

    async def stop(self) -> None:
        """Stop the sandbox."""
        if not self._started:
            return

        self._info = await self.client.stop_sandbox(self.name)
        self._started = False

    async def delete(self) -> None:
        """Delete the sandbox."""
        await self.client.delete_sandbox(self.name)
        self._info = None
        self._started = False

    async def close(self) -> None:
        """Close the client connection."""
        await self.client.close()

    async def __aenter__(self) -> "Sandbox":
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

    async def status(self) -> SandboxInfo:
        """Get the current sandbox status."""
        self._info = await self.client.get_sandbox(self.name)
        return self._info

    @property
    def is_started(self) -> bool:
        """Whether the sandbox has been started."""
        return self._started

    @property
    def state(self) -> Optional[SandboxState]:
        """Get the current sandbox state."""
        return self._info.state if self._info else None

    @property
    def mounts(self) -> list[MountInfo]:
        """Get the sandbox mounts."""
        return self._info.mounts if self._info else []

    @property
    def info(self) -> Optional[SandboxInfo]:
        """Get the raw sandbox info."""
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
        Execute a command directly in the sandbox VM.

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
        Run a command in a container image within the sandbox.

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
        Stream logs from the sandbox.

        Args:
            follow: Keep streaming new logs
            tail: Number of recent lines to return

        Yields:
            Log lines
        """
        async for line in self.client.stream_logs(self.name, follow=follow, tail=tail):
            yield line

    # =========================================================================
    # Containers
    # =========================================================================

    async def create_container(self, options: ContainerOptions) -> ContainerInfo:
        """
        Create a container in the sandbox.

        Args:
            options: Container options

        Returns:
            ContainerInfo
        """
        mounts = None
        if options.mounts:
            mounts = [
                {"source": m.source, "target": m.target, "readonly": m.readonly}
                for m in options.mounts
            ]

        return await self.client.create_container(
            self.name,
            image=options.image,
            command=options.command,
            env=options.env,
            workdir=options.workdir,
            mounts=mounts,
        )

    async def list_containers(self) -> list[ContainerInfo]:
        """List all containers in the sandbox."""
        return await self.client.list_containers(self.name)

    async def start_container(self, container_id: str) -> str:
        """Start a container.

        Returns:
            The container ID that was started.
        """
        return await self.client.start_container(self.name, container_id)

    async def stop_container(
        self, container_id: str, timeout: Optional[int] = None
    ) -> None:
        """Stop a container.

        Note: Use list_containers() to verify the container state after stopping.
        """
        await self.client.stop_container(self.name, container_id, timeout)

    async def delete_container(self, container_id: str, force: bool = False) -> None:
        """Delete a container."""
        await self.client.delete_container(self.name, container_id, force)

    async def exec_container(
        self,
        container_id: str,
        command: list[str],
        env: Optional[dict[str, str]] = None,
        workdir: Optional[str] = None,
        timeout: Optional[int] = None,
    ) -> ExecResult:
        """Execute a command in a container."""
        response = await self.client.exec_container(
            self.name,
            container_id,
            command,
            env=env,
            workdir=workdir,
            timeout_secs=timeout,
        )
        return ExecResult.from_dict(response)

    # =========================================================================
    # Images
    # =========================================================================

    async def list_images(self) -> list[ImageInfo]:
        """List all images in the sandbox."""
        return await self.client.list_images(self.name)

    async def pull_image(
        self, image: str, oci_platform: Optional[str] = None
    ) -> ImageInfo:
        """Pull an image into the sandbox."""
        return await self.client.pull_image(self.name, image, oci_platform)


# =============================================================================
# Helper Functions
# =============================================================================


@asynccontextmanager
async def with_sandbox(config: SandboxConfig):
    """
    Create a sandbox, yield it, and clean up afterwards.

    This is the recommended way to use sandboxes for short-lived tasks.

    Example:
        async with with_sandbox(SandboxConfig(name="test")) as sandbox:
            result = await sandbox.exec(["echo", "hello"])
            print(result.stdout)
    """
    sandbox = await Sandbox.create(config)
    try:
        yield sandbox
    finally:
        try:
            await sandbox.stop()
        except Exception:
            pass
        try:
            await sandbox.delete()
        except Exception:
            pass
        await sandbox.close()


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
    Quick execution helper - creates a temporary sandbox, runs a command, and cleans up.

    Args:
        command: Command to execute
        name: Sandbox name (auto-generated if not provided)
        server_url: smolvm server URL
        mounts: Volume mounts
        env: Environment variables
        workdir: Working directory
        timeout: Timeout in seconds

    Returns:
        ExecResult
    """
    import time

    config = SandboxConfig(
        name=name or f"quick-exec-{int(time.time() * 1000)}",
        server_url=server_url,
        mounts=mounts or [],
    )

    async with with_sandbox(config) as sandbox:
        return await sandbox.exec(command, env=env, workdir=workdir, timeout=timeout)


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
    Quick run helper - creates a temporary sandbox, runs in an image, and cleans up.

    Args:
        image: OCI image reference
        command: Command to execute
        name: Sandbox name (auto-generated if not provided)
        server_url: smolvm server URL
        mounts: Volume mounts
        env: Environment variables
        workdir: Working directory
        timeout: Timeout in seconds

    Returns:
        ExecResult
    """
    import time

    config = SandboxConfig(
        name=name or f"quick-run-{int(time.time() * 1000)}",
        server_url=server_url,
        mounts=mounts or [],
    )

    async with with_sandbox(config) as sandbox:
        return await sandbox.run(image, command, env=env, workdir=workdir, timeout=timeout)
