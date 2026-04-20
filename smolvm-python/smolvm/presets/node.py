"""Node.js machine preset."""

from typing import Optional

from ..execution import ExecResult
from ..machine import with_machine
from ..types import MountSpec, ResourceSpec, MachineConfig


async def node_machine(
    code: str,
    name: Optional[str] = None,
    server_url: str = "http://127.0.0.1:8080",
    mounts: Optional[list[MountSpec]] = None,
    image: str = "node:22-alpine",
    timeout: Optional[int] = None,
    cpus: int = 1,
    memory_mb: int = 512,
) -> ExecResult:
    """
    Execute JavaScript code in an isolated Node.js machine.

    Args:
        code: JavaScript code to execute
        name: Machine name (auto-generated if not provided)
        server_url: smolvm server URL
        mounts: Volume mounts
        image: Node.js image to use (default: node:22-alpine)
        timeout: Execution timeout in seconds
        cpus: Number of vCPUs
        memory_mb: Memory in MB

    Returns:
        ExecResult with exit_code, stdout, stderr

    Example:
        result = await node_machine('''
            console.log("Node.js version:", process.version);
            console.log("Hello from machine!");
        ''')
        print(result.stdout)
    """
    import time

    config = MachineConfig(
        name=name or f"node-{int(time.time() * 1000)}",
        server_url=server_url,
        mounts=mounts or [],
        resources=ResourceSpec(cpus=cpus, memory_mb=memory_mb),
    )

    async with with_machine(config) as machine:
        return await machine.run(
            image=image,
            command=["node", "-e", code],
            timeout=timeout,
        )


async def node_file(
    file_path: str,
    name: Optional[str] = None,
    server_url: str = "http://127.0.0.1:8080",
    mount_dir: Optional[str] = None,
    image: str = "node:22-alpine",
    timeout: Optional[int] = None,
    cpus: int = 1,
    memory_mb: int = 512,
) -> ExecResult:
    """
    Execute a JavaScript file in an isolated Node.js machine.

    The file's directory is automatically mounted if mount_dir is not specified.

    Args:
        file_path: Path to the JavaScript file
        name: Machine name (auto-generated if not provided)
        server_url: smolvm server URL
        mount_dir: Directory to mount (defaults to file's parent directory)
        image: Node.js image to use
        timeout: Execution timeout in seconds
        cpus: Number of vCPUs
        memory_mb: Memory in MB

    Returns:
        ExecResult with exit_code, stdout, stderr

    Example:
        result = await node_file("/path/to/script.js")
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

    config = MachineConfig(
        name=name or f"node-file-{int(time.time() * 1000)}",
        server_url=server_url,
        mounts=[MountSpec(source=mount_dir, target="/workspace")],
        resources=ResourceSpec(cpus=cpus, memory_mb=memory_mb),
    )

    async with with_machine(config) as machine:
        return await machine.run(
            image=image,
            command=["node", f"/workspace/{rel_path}"],
            workdir="/workspace",
            timeout=timeout,
        )


async def npm_run(
    script: str,
    project_dir: str,
    name: Optional[str] = None,
    server_url: str = "http://127.0.0.1:8080",
    image: str = "node:22-alpine",
    timeout: Optional[int] = None,
    cpus: int = 1,
    memory_mb: int = 512,
) -> ExecResult:
    """
    Run an npm script in an isolated machine.

    Args:
        script: npm script name to run (e.g., "test", "build")
        project_dir: Path to the project directory (containing package.json)
        name: Machine name (auto-generated if not provided)
        server_url: smolvm server URL
        image: Node.js image to use
        timeout: Execution timeout in seconds
        cpus: Number of vCPUs
        memory_mb: Memory in MB

    Returns:
        ExecResult with exit_code, stdout, stderr

    Example:
        result = await npm_run("test", "/path/to/project")
        print(result.stdout)
    """
    import os
    import time

    project_dir = os.path.abspath(project_dir)

    config = MachineConfig(
        name=name or f"npm-{int(time.time() * 1000)}",
        server_url=server_url,
        mounts=[MountSpec(source=project_dir, target="/workspace")],
        resources=ResourceSpec(cpus=cpus, memory_mb=memory_mb),
    )

    async with with_machine(config) as machine:
        return await machine.run(
            image=image,
            command=["npm", "run", script],
            workdir="/workspace",
            timeout=timeout,
        )
