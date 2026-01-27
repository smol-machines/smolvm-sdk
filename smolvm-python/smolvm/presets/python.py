"""Python sandbox preset."""

from typing import Optional

from ..execution import ExecResult
from ..sandbox import Sandbox, with_sandbox
from ..types import MountSpec, ResourceSpec, SandboxConfig


async def python_sandbox(
    code: str,
    name: Optional[str] = None,
    server_url: str = "http://127.0.0.1:8080",
    mounts: Optional[list[MountSpec]] = None,
    image: str = "python:3.12-alpine",
    timeout: Optional[int] = None,
    cpus: int = 1,
    memory_mb: int = 512,
) -> ExecResult:
    """
    Execute Python code in an isolated sandbox.

    Args:
        code: Python code to execute
        name: Sandbox name (auto-generated if not provided)
        server_url: smolvm server URL
        mounts: Volume mounts
        image: Python image to use (default: python:3.12-alpine)
        timeout: Execution timeout in seconds
        cpus: Number of vCPUs
        memory_mb: Memory in MB

    Returns:
        ExecResult with exit_code, stdout, stderr

    Example:
        result = await python_sandbox('''
            import sys
            print(f"Python {sys.version}")
            print("Hello from sandbox!")
        ''')
        print(result.stdout)
    """
    import time

    config = SandboxConfig(
        name=name or f"python-{int(time.time() * 1000)}",
        server_url=server_url,
        mounts=mounts or [],
        resources=ResourceSpec(cpus=cpus, memory_mb=memory_mb),
    )

    async with with_sandbox(config) as sandbox:
        return await sandbox.run(
            image=image,
            command=["python", "-c", code],
            timeout=timeout,
        )


async def python_file(
    file_path: str,
    name: Optional[str] = None,
    server_url: str = "http://127.0.0.1:8080",
    mount_dir: Optional[str] = None,
    image: str = "python:3.12-alpine",
    timeout: Optional[int] = None,
    cpus: int = 1,
    memory_mb: int = 512,
) -> ExecResult:
    """
    Execute a Python file in an isolated sandbox.

    The file's directory is automatically mounted if mount_dir is not specified.

    Args:
        file_path: Path to the Python file
        name: Sandbox name (auto-generated if not provided)
        server_url: smolvm server URL
        mount_dir: Directory to mount (defaults to file's parent directory)
        image: Python image to use
        timeout: Execution timeout in seconds
        cpus: Number of vCPUs
        memory_mb: Memory in MB

    Returns:
        ExecResult with exit_code, stdout, stderr

    Example:
        result = await python_file("/path/to/script.py")
        print(result.stdout)
    """
    import os
    import time

    # Resolve paths
    file_path = os.path.abspath(file_path)
    if mount_dir is None:
        mount_dir = os.path.dirname(file_path)
    mount_dir = os.path.abspath(mount_dir)

    # Calculate the relative path of the file within the mount
    rel_path = os.path.relpath(file_path, mount_dir)

    config = SandboxConfig(
        name=name or f"python-file-{int(time.time() * 1000)}",
        server_url=server_url,
        mounts=[MountSpec(source=mount_dir, target="/workspace")],
        resources=ResourceSpec(cpus=cpus, memory_mb=memory_mb),
    )

    async with with_sandbox(config) as sandbox:
        return await sandbox.run(
            image=image,
            command=["python", f"/workspace/{rel_path}"],
            workdir="/workspace",
            timeout=timeout,
        )
