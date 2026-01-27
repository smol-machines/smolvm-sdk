# smolvm TypeScript SDK

TypeScript SDK for smolvm - a microVM sandbox management system.

## Installation

```bash
npm install smolvm
```

## Requirements

- Node.js 18.0.0 or later
- A running smolvm server (default: `http://127.0.0.1:8080`)

## Quick Start

### Basic Usage

```typescript
import { Sandbox } from "smolvm";

// Create and auto-start a sandbox
const sandbox = await Sandbox.create({ name: "my-sandbox" });

try {
  // Execute a command in the VM
  const result = await sandbox.exec(["echo", "Hello, World!"]);
  console.log(result.stdout); // "Hello, World!\n"

  // Run a command in a container image
  const pyResult = await sandbox.run("python:3.12", [
    "python",
    "-c",
    "print(2+2)",
  ]);
  console.log(pyResult.stdout); // "4\n"
} finally {
  await sandbox.stop();
  await sandbox.delete();
}
```

### Using the `withSandbox` Helper

For short-lived tasks, use `withSandbox` for automatic cleanup:

```typescript
import { withSandbox } from "smolvm";

const result = await withSandbox({ name: "temp-sandbox" }, async (sandbox) => {
  return sandbox.exec(["uname", "-a"]);
});
console.log(result.stdout);
// Sandbox is automatically stopped and deleted
```

### Python Sandbox

```typescript
import { PythonSandbox } from "smolvm";

const sandbox = await PythonSandbox.create({ name: "python-env" });

try {
  // Run Python code directly
  const result = await sandbox.runCode(`
import sys
print(f"Python {sys.version}")
print(2 ** 10)
  `);
  console.log(result.stdout);

  // Install packages
  await sandbox.pip(["requests"]);

  // Use installed packages
  const httpResult = await sandbox.runCode(`
import requests
r = requests.get("https://httpbin.org/ip")
print(r.json())
  `);
  console.log(httpResult.stdout);
} finally {
  await sandbox.stop();
  await sandbox.delete();
}
```

### Node.js Sandbox

```typescript
import { NodeSandbox } from "smolvm";

const sandbox = await NodeSandbox.create({ name: "node-env" });

try {
  // Run JavaScript code
  const result = await sandbox.runCode(`
    console.log("Node.js version:", process.version);
    console.log("Platform:", process.platform);
  `);
  console.log(result.stdout);

  // Run ES modules
  const esmResult = await sandbox.runESM(`
    const msg = "Hello from ESM!";
    console.log(msg);
  `);
  console.log(esmResult.stdout);
} finally {
  await sandbox.stop();
  await sandbox.delete();
}
```

### Container Management

```typescript
import { Sandbox } from "smolvm";

const sandbox = await Sandbox.create({
  name: "container-host",
  mounts: [{ source: "/tmp/data", target: "/data" }],
});

try {
  // Create a container
  const container = await sandbox.createContainer({
    image: "nginx:alpine",
    mounts: [
      { tag: "smolvm0", target: "/usr/share/nginx/html", readonly: true },
    ],
  });

  await container.start();

  // Execute commands in the container
  const result = await container.exec(["nginx", "-v"]);
  console.log(result.stderr);

  await container.stop();
  await container.delete();
} finally {
  await sandbox.stop();
  await sandbox.delete();
}
```

### Streaming Logs

```typescript
import { Sandbox } from "smolvm";

const sandbox = await Sandbox.create({ name: "log-demo" });

try {
  // Start a process that produces output
  sandbox.exec(["sh", "-c", "while true; do date; sleep 1; done"]);

  // Stream logs with an abort signal
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5000);

  for await (const line of sandbox.logs({ follow: true })) {
    console.log(`[LOG] ${line}`);
  }
} catch (e) {
  // AbortError is expected when we stop streaming
} finally {
  await sandbox.stop();
  await sandbox.delete();
}
```

## API Reference

### Sandbox

The main class for managing sandboxes.

```typescript
// Create a sandbox
const sandbox = new Sandbox(config);
await sandbox.start();

// Or use the static factory
const sandbox = await Sandbox.create(config);
```

#### Configuration

```typescript
interface SandboxConfig {
  name: string;
  serverUrl?: string; // default: "http://127.0.0.1:8080"
  mounts?: MountSpec[];
  ports?: PortSpec[];
  resources?: ResourceSpec;
}
```

#### Methods

| Method                     | Description                       |
| -------------------------- | --------------------------------- |
| `start()`                  | Create and start the sandbox      |
| `stop()`                   | Stop the sandbox                  |
| `delete()`                 | Delete the sandbox                |
| `status()`                 | Get current sandbox status        |
| `exec(command, options?)`  | Execute command in VM             |
| `run(image, cmd, options?)` | Run command in container image    |
| `logs(options?)`           | Stream sandbox logs               |
| `createContainer(options)` | Create a container                |
| `listContainers()`         | List all containers               |
| `getContainer(id)`         | Get container by ID               |
| `listImages()`             | List available images             |
| `pullImage(image)`         | Pull a container image            |

### Container

Represents a container within a sandbox.

#### Methods

| Method                    | Description                    |
| ------------------------- | ------------------------------ |
| `start()`                 | Start the container            |
| `stop(timeout?)`          | Stop the container             |
| `delete(force?)`          | Delete the container           |
| `exec(command, options?)` | Execute command in container   |
| `refresh()`               | Refresh container info         |

### ExecResult

Result from command execution.

```typescript
const result = await sandbox.exec(["echo", "hello"]);

result.exitCode; // number
result.stdout; // string
result.stderr; // string
result.success; // boolean (exitCode === 0)
result.output; // string (combined stdout + stderr)

// Throw if command failed
result.assertSuccess();
```

### SmolvmClient

Low-level HTTP client for direct API access.

```typescript
import { SmolvmClient } from "smolvm";

const client = new SmolvmClient("http://127.0.0.1:8080");

// Health check
const health = await client.health();

// Direct API calls
const sandboxes = await client.listSandboxes();
```

## Error Handling

The SDK provides typed errors:

```typescript
import {
  SmolvmError,
  NotFoundError,
  ConflictError,
  BadRequestError,
  TimeoutError,
  ConnectionError,
} from "smolvm";

try {
  await sandbox.exec(["some-command"]);
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log("Sandbox not found");
  } else if (error instanceof TimeoutError) {
    console.log("Command timed out");
  } else if (error instanceof ConnectionError) {
    console.log("Cannot connect to smolvm server");
  }
}
```

## Helper Functions

### `withSandbox`

```typescript
const result = await withSandbox(config, async (sandbox) => {
  return sandbox.exec(["echo", "hello"]);
});
```

### `quickExec`

```typescript
const result = await quickExec(["uname", "-a"]);
```

### `quickRun`

```typescript
const result = await quickRun("python:3.12", ["python", "-c", "print(42)"]);
```

## Building from Source

```bash
cd sdk/typescript
npm install
npm run build
```

## Type Checking

```bash
npm run typecheck
```

## License

Apache-2.0
