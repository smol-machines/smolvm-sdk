# smolvm Python SDK

Python SDK for smolvm - lightweight microVM sandboxes for secure code execution.

## Installation

```bash
pip install smolvm
```

Or install from source:

```bash
cd sdk/python
pip install -e .
```

## Requirements

- Python 3.10+
- smolvm server running (default: `http://127.0.0.1:8080`)

## Quick Start

```python
import asyncio
from smolvm import quick_exec, quick_run

async def main():
    # Execute a command in a microVM
    result = await quick_exec(["echo", "Hello from microVM!"])
    print(result.stdout)  # "Hello from microVM!"

    # Run code in a container
    result = await quick_run(
        image="python:3.12-alpine",
        command=["python", "-c", "print('Hello from Python!')"]
    )
    print(result.stdout)  # "Hello from Python!"

asyncio.run(main())
```

## Usage

### Sandbox Lifecycle

```python
from smolvm import Sandbox, SandboxConfig

async def main():
    config = SandboxConfig(name="my-sandbox")

    # Option 1: Manual lifecycle
    sandbox = Sandbox(config)
    await sandbox.start()
    result = await sandbox.exec(["uname", "-a"])
    await sandbox.stop()
    await sandbox.delete()
    await sandbox.close()

    # Option 2: Context manager (recommended)
    async with Sandbox(config) as sandbox:
        await sandbox.start()
        result = await sandbox.exec(["uname", "-a"])
        print(result.stdout)
    # Automatically stops, deletes, and closes
```

### Volume Mounts

```python
from smolvm import SandboxConfig, MountSpec, with_sandbox

config = SandboxConfig(
    name="with-mounts",
    mounts=[
        MountSpec(source="/host/path", target="/sandbox/path"),
        MountSpec(source="/readonly", target="/data", readonly=True),
    ]
)

async with with_sandbox(config) as sandbox:
    result = await sandbox.exec(["cat", "/sandbox/path/file.txt"])
```

### Running Containers

```python
from smolvm import Sandbox, SandboxConfig

async with Sandbox(SandboxConfig(name="containers")) as sandbox:
    await sandbox.start()

    # Run code in different language containers
    py_result = await sandbox.run(
        image="python:3.12-alpine",
        command=["python", "-c", "print('Python!')"]
    )

    node_result = await sandbox.run(
        image="node:22-alpine",
        command=["node", "-e", "console.log('Node.js!')"]
    )
```

### Language Presets

```python
from smolvm.presets import python_sandbox, node_sandbox

# Execute Python code directly
result = await python_sandbox("""
import json
data = {"message": "Hello!"}
print(json.dumps(data))
""")

# Execute JavaScript code directly
result = await node_sandbox("""
const data = { message: "Hello!" };
console.log(JSON.stringify(data));
""")
```

### Error Handling

```python
from smolvm import quick_exec, ExecutionError, ConnectionError

try:
    result = await quick_exec(["false"])  # exit code 1
    result.assert_success()  # Raises ExecutionError
except ExecutionError as e:
    print(f"Command failed: exit code {e.exit_code}")
    print(f"stderr: {e.stderr}")
except ConnectionError as e:
    print(f"Cannot connect to smolvm server: {e}")
```

### Resource Configuration

```python
from smolvm import SandboxConfig, ResourceSpec

config = SandboxConfig(
    name="high-performance",
    resources=ResourceSpec(
        cpus=4,
        memory_mb=2048,
    )
)
```

## API Reference

### Types

- `SandboxConfig` - Configuration for creating a sandbox
- `SandboxInfo` - Runtime information about a sandbox
- `MountSpec` - Volume mount specification (source, target, readonly)
- `PortSpec` - Port forwarding specification (host, guest)
- `ResourceSpec` - Resource allocation (cpus, memory_mb)
- `ExecResult` - Command execution result (exit_code, stdout, stderr)
- `ContainerInfo` - Container information
- `ImageInfo` - OCI image information

### Exceptions

- `SmolvmError` - Base exception
- `ConnectionError` - Failed to connect to server
- `TimeoutError` - Request timed out
- `NotFoundError` - Resource not found (404)
- `ConflictError` - Resource conflict (409)
- `BadRequestError` - Invalid request (400)
- `InternalError` - Server error (500)
- `ExecutionError` - Command failed (non-zero exit code)

### Helper Functions

- `quick_exec(command, ...)` - One-shot command execution
- `quick_run(image, command, ...)` - One-shot container run
- `with_sandbox(config)` - Context manager for sandbox lifecycle

## Networking

Sandboxes use TSI (Transparent Socket Impersonation) for network access:

- **TCP/UDP**: Fully supported (HTTP, HTTPS, database connections, etc.)
- **ICMP**: Not supported (ping won't work)
- **Raw sockets**: Not supported

```python
# This works
result = await sandbox.exec(["wget", "-qO-", "https://example.com"])

# This won't work (ICMP)
result = await sandbox.exec(["ping", "-c1", "example.com"])
```

## License

MIT
