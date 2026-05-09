# smolvm Go SDK

Go SDK for [smolvm](https://github.com/smol-machines/smolvm-sdk) — a microVM
machine management system.

## Installation

```bash
go get github.com/smol-machines/smolvm-sdk/smolvm-go
```

## Requirements

- Go 1.21 or later
- A running smolvm server (default: `http://127.0.0.1:8080`)

  ```bash
  smolvm serve start --listen 127.0.0.1:8080
  ```

## Quick start

```go
package main

import (
	"context"
	"fmt"
	"log"

	smolvm "github.com/smol-machines/smolvm-sdk/smolvm-go"
)

func main() {
	ctx := context.Background()

	m, err := smolvm.CreateMachine(ctx, smolvm.Config{Name: "my-machine"})
	if err != nil {
		log.Fatal(err)
	}
	defer m.Delete(ctx)
	defer m.Stop(ctx)

	// Run a command directly in the VM.
	result, err := m.Exec(ctx, []string{"echo", "Hello, World!"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(result.Stdout) // "Hello, World!\n"

	// Run a command inside an OCI image.
	py, err := m.Run(ctx, "python:3.12-alpine",
		[]string{"python", "-c", "print(2 + 2)"})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(py.Stdout) // "4\n"
}
```

## Usage

### `WithMachine` helper

For short-lived workloads, `WithMachine` ensures the machine is stopped and
deleted even on error or panic:

```go
err := smolvm.WithMachine(ctx, smolvm.Config{Name: "temp"},
	func(ctx context.Context, m *smolvm.Machine) error {
		out, err := m.Exec(ctx, []string{"uname", "-a"})
		if err != nil {
			return err
		}
		fmt.Println(out.Stdout)
		return nil
	},
)
```

### Quick helpers

```go
// One-shot command execution in an ephemeral VM.
result, _ := smolvm.QuickExec(ctx,
	[]string{"date"},
	smolvm.Config{}, // server fills in name/defaults
)

// One-shot run in a container image.
result, _ = smolvm.QuickRun(ctx,
	"python:3.12-alpine",
	[]string{"python", "-c", "print('hi')"},
	smolvm.Config{},
)
```

### Volume mounts and ports

```go
config := smolvm.Config{
	Name: "with-mounts",
	Mounts: []smolvm.MountSpec{
		{Source: "/host/code", Target: "/workspace"},
		{Source: "/host/data", Target: "/data", Readonly: true},
	},
	Ports: []smolvm.PortSpec{
		{Host: 8080, Guest: 80},
	},
	Network: true,
}

err := smolvm.WithMachine(ctx, config, func(ctx context.Context, m *smolvm.Machine) error {
	_, err := m.Exec(ctx, []string{"ls", "/workspace"})
	return err
})
```

### Resource configuration

```go
config := smolvm.Config{
	Name:     "high-cpu",
	CPUs:     4,
	MemoryMB: 2048,
	Network:  true, // outbound TCP/UDP (no ICMP)
}
```

### Streaming exec

```go
events, err := m.ExecStream(ctx, []string{"sh", "-c", "for i in 1 2 3; do echo $i; sleep 1; done"})
if err != nil {
	return err
}
for ev := range events {
	switch ev.Event {
	case "stdout":
		fmt.Printf("[stdout] %s\n", ev.Data)
	case "stderr":
		fmt.Printf("[stderr] %s\n", ev.Data)
	case "exit":
		fmt.Printf("[exit]   %s\n", ev.Data) // {"exitCode":0}
	}
}
```

### Streaming logs

```go
ch, err := m.Logs(ctx, smolvm.LogsOptions{Follow: true})
if err != nil {
	return err
}
for line := range ch {
	fmt.Println(line)
}
```

### File transfer

```go
// Upload
if _, err := m.UploadFile(ctx, "workspace/script.py", []byte(code)); err != nil {
	return err
}

// Download (buffered)
contents, err := m.DownloadFile(ctx, "workspace/output.json")

// Download (streaming, for large files)
rc, err := m.DownloadFileStream(ctx, "workspace/big-blob.tar")
if err != nil {
	return err
}
defer rc.Close()
io.Copy(dst, rc)
```

### Language presets

The `presets` package wraps `WithMachine` for common runtimes. Each call
creates a fresh ephemeral machine, pulls the image into it, runs the code, and
cleans up. Networking is enabled by default so the image pull succeeds:

```go
import "github.com/smol-machines/smolvm-sdk/smolvm-go/presets"

// Python source (default image: python:3.12-alpine)
result, _ := presets.PythonCode(ctx, `
import sys
print(sys.version)
`, presets.PythonOptions{})

// Python file (the file's directory is mounted at /workspace)
result, _ = presets.PythonFile(ctx, "/path/to/script.py", presets.PythonOptions{})

// Node.js source (default image: node:22-alpine)
result, _ = presets.NodeCode(ctx, `console.log(process.version)`, presets.NodeOptions{})

// Install Python packages
result, _ = presets.Pip(ctx, []string{"requests"}, presets.PythonOptions{})

// Run an npm script in a host-side project directory
result, _ = presets.NpmRun(ctx, "/path/to/project", "build", presets.NodeOptions{})
```

For lower-level use, `Machine.Run` and `QuickRun` do **not** auto-pull. Pull
the image into the machine yourself first:

```go
err := smolvm.WithMachine(ctx, smolvm.Config{Name: "demo", Network: true},
    func(ctx context.Context, m *smolvm.Machine) error {
        if _, err := m.PullImage(ctx, "alpine", ""); err != nil {
            return err
        }
        _, err := m.Run(ctx, "alpine", []string{"echo", "hi"})
        return err
    })
```

### Error handling

The SDK returns typed `*smolvm.Error` values for server errors. Use
`errors.Is` against the sentinel values, or `errors.As` for the full struct:

```go
import "errors"

_, err := m.Status(ctx)
switch {
case errors.Is(err, smolvm.ErrNotFound):
	// machine is gone
case errors.Is(err, smolvm.ErrConflict):
	// resource conflict (e.g., duplicate machine name)
case errors.Is(err, smolvm.ErrConnection):
	// can't reach the server
}

var apiErr *smolvm.Error
if errors.As(err, &apiErr) {
	fmt.Println(apiErr.Code, apiErr.StatusCode)
}
```

`ExecResult.AssertSuccess` returns an `*ExecutionError` if the command exited
non-zero:

```go
result, err := m.Exec(ctx, []string{"false"})
if err != nil { return err }
if _, err := result.AssertSuccess(); err != nil {
	var execErr *smolvm.ExecutionError
	if errors.As(err, &execErr) {
		fmt.Printf("exit=%d stderr=%s\n", execErr.ExitCode, execErr.Stderr)
	}
}
```

## API reference

### Top-level types

| Type           | Description                                            |
|----------------|--------------------------------------------------------|
| `Machine`      | High-level handle for a smolvm machine                 |
| `Client`       | Low-level HTTP client                                  |
| `Config`       | Configuration for `NewMachine` / `CreateMachine`       |
| `MountSpec`    | Host-to-VM volume mount                                |
| `PortSpec`     | Host-to-VM port forward                                |
| `ExecOptions`  | Per-call options for Exec/Run                          |
| `LogsOptions`  | Per-call options for Logs                              |
| `ExecResult`   | Friendly wrapper around `ExecResponse`                 |

### `Machine` methods

| Method                 | Description                              |
|------------------------|------------------------------------------|
| `Start(ctx)`           | Create on the server and start           |
| `Stop(ctx)`            | Stop the VM                              |
| `Delete(ctx)`          | Delete the machine                       |
| `ForceDelete(ctx)`     | Delete even if VM is still running       |
| `Status(ctx)`          | Refresh and return `*MachineInfo`        |
| `IsStarted()`          | Cached: was Start called?                |
| `State()`              | Cached `MachineState`                    |
| `Exec(ctx, cmd, opts)` | Run a command directly in the VM         |
| `Run(ctx, image, cmd, opts...)` | Run a command in an OCI image (image must be pulled first) |
| `ExecStream(...)`      | Streaming version of Exec                |
| `Logs(ctx, opts)`      | Stream logs (SSE)                        |
| `ListImages(ctx)`      | List images cached in the machine        |
| `PullImage(ctx, ...)`  | Pull an OCI image into the machine       |
| `UploadFile(ctx, ...)` | Write a file to the VM                   |
| `DownloadFile(ctx, p)` | Read a file from the VM (buffered)       |
| `DownloadFileStream`   | Read a file from the VM (streaming)      |
| `Resize(ctx, ...)`     | Expand storage/overlay disks             |

### Errors

- `ErrNotFound`, `ErrConflict`, `ErrBadRequest`, `ErrTimeout`,
  `ErrInternal`, `ErrConnection` — sentinels for `errors.Is`
- `*Error` — carries `Message`, `Code`, `StatusCode`
- `*ExecutionError` — non-zero exit code from `AssertSuccess`

### Helper functions

- `CreateMachine(ctx, config)` — create + start in one call
- `WithMachine(ctx, config, fn)` — context-manager-style cleanup
- `QuickExec(ctx, cmd, config, opts...)` — ephemeral exec
- `QuickRun(ctx, image, cmd, config, opts...)` — ephemeral run

## Networking

Outbound networking is **off by default**. Set `Config.Network = true` to
enable. smolvm supports TCP and UDP; ICMP (`ping`) is not supported.

## Examples

See [`examples/`](./examples/):

- [`basic`](./examples/basic) — quick exec, manual lifecycle, `WithMachine`
- [`streaming`](./examples/streaming) — `ExecStream`
- [`presets`](./examples/presets) — Python and Node helpers
- [`files`](./examples/files) — upload/download

Run any example with:

```bash
go run ./examples/basic
```

## License

Apache-2.0
