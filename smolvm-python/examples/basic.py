#!/usr/bin/env python3
"""Basic example of using the smolvm Python SDK."""

import asyncio

from smolvm import Sandbox, SandboxConfig, quick_exec


async def main():
    # Quick one-off execution
    print("=== Quick Execution ===")
    result = await quick_exec(["echo", "Hello from quick_exec!"])
    print(f"Output: {result.stdout}")
    print(f"Exit code: {result.exit_code}")
    print()

    # Using Sandbox with context manager
    print("=== Sandbox Context Manager ===")
    config = SandboxConfig(name="example-sandbox")

    async with Sandbox(config) as sandbox:
        await sandbox.start()

        # Run commands directly in the VM
        result = await sandbox.exec(["uname", "-a"])
        print(f"VM info: {result.stdout}")

        # Run multiple commands
        result = await sandbox.exec(["ls", "-la", "/"])
        print(f"Root directory:\n{result.stdout}")


if __name__ == "__main__":
    asyncio.run(main())
