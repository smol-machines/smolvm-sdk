#!/usr/bin/env python3
"""Example of error handling with the smolvm SDK."""

import asyncio

from smolvm import (
    Machine,
    MachineConfig,
    quick_exec,
    SmolvmError,
    ConnectionError,
    NotFoundError,
    ExecutionError,
)


async def main():
    # Example 1: Connection error (server not running)
    print("=== Connection Error Handling ===")
    try:
        result = await quick_exec(
            ["echo", "hello"],
            server_url="http://localhost:9999",  # Wrong port
        )
    except ConnectionError as e:
        print(f"Connection failed (expected): {e}")
    print()

    # Example 2: Command failure with assert_success()
    print("=== Command Failure Handling ===")
    try:
        result = await quick_exec(["sh", "-c", "echo 'error' >&2; exit 42"])
        result.assert_success()  # Raises ExecutionError
    except ExecutionError as e:
        print(f"Command failed with exit code {e.exit_code}")
        print(f"  stdout: {e.stdout}")
        print(f"  stderr: {e.stderr}")
    print()

    # Example 3: Check success without raising
    print("=== Checking Success Without Raising ===")
    result = await quick_exec(["sh", "-c", "exit 1"])
    if result.success:
        print("Command succeeded")
    else:
        print(f"Command failed with exit code {result.exit_code}")
    print()

    # Example 4: Non-existent machine
    print("=== Not Found Error ===")
    config = MachineConfig(name="nonexistent-machine-12345")
    machine = Machine(config)
    try:
        # Try to get status of a machine that doesn't exist
        await machine.status()
    except NotFoundError as e:
        print(f"Machine not found (expected): {e}")
    await machine.close()
    print()

    # Example 5: Generic error handling
    print("=== Generic Error Handling ===")
    try:
        result = await quick_exec(["some-nonexistent-command"])
        result.assert_success()
    except ExecutionError as e:
        print(f"Execution error: exit code {e.exit_code}")
    except SmolvmError as e:
        print(f"Smolvm error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
