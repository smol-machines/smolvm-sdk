# smolvm SDKs

Official SDK libraries for smolvm - lightweight microVM sandboxes for secure code execution.

## Available SDKs

| SDK | Language | Package | Install |
|-----|----------|---------|---------|
| [smolvm-node](./smolvm-node/) | TypeScript/JavaScript | `smolvm` | `npm install smolvm` |
| [smolvm-python](./smolvm-python/) | Python | `smolvm` | `pip install smolvm` |

## Quick Start

### Node.js / TypeScript

```typescript
import { Sandbox } from 'smolvm';

const sandbox = await Sandbox.create({ name: 'my-sandbox' });

// Execute command in microVM
const result = await sandbox.exec(['echo', 'Hello from microVM!']);
console.log(result.stdout);

// Run in container
const pyResult = await sandbox.run('python:3.12-alpine', ['python', '-c', 'print("Hello!")']);
console.log(pyResult.stdout);

await sandbox.stop();
```

### Python

```python
import asyncio
from smolvm import Sandbox, SandboxConfig

async def main():
    config = SandboxConfig(name="my-sandbox")

    async with Sandbox(config) as sandbox:
        await sandbox.start()

        # Execute command in microVM
        result = await sandbox.exec(["echo", "Hello from microVM!"])
        print(result.stdout)

        # Run in container
        py_result = await sandbox.run("python:3.12-alpine", ["python", "-c", "print('Hello!')"])
        print(py_result.stdout)

asyncio.run(main())
```

## Features

All SDKs provide:

- **Sandbox Management** - Create, start, stop, delete sandboxes
- **Command Execution** - Run commands directly in the microVM
- **Container Support** - Run OCI containers (Docker images) inside sandboxes
- **Volume Mounts** - Mount host directories into sandboxes
- **Resource Control** - Configure CPU and memory limits
- **Streaming Logs** - Stream stdout/stderr from sandboxes
- **Language Presets** - Quick helpers for Python, Node.js, etc.

## Requirements

- smolvm server running (default: `http://127.0.0.1:8080`)
- macOS with Apple Silicon, or Linux with KVM support

## API Consistency

All SDKs follow the same API patterns:

| Operation | Node.js | Python |
|-----------|---------|--------|
| Create sandbox | `Sandbox.create(config)` | `await Sandbox.create(config)` |
| Execute command | `sandbox.exec(cmd)` | `await sandbox.exec(cmd)` |
| Run in container | `sandbox.run(image, cmd)` | `await sandbox.run(image, cmd)` |
| Quick execution | `quickExec(cmd)` | `await quick_exec(cmd)` |
| Context manager | `using sandbox = ...` | `async with Sandbox(...) as sandbox:` |

## Contributing

See the main [smolvm repository](https://github.com/smolvm/smolvm) for contribution guidelines.

## License

MIT
