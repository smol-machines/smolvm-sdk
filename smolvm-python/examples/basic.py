#!/usr/bin/env python3
"""Basic example of using the smolvm Python SDK."""

import asyncio

from smolvm import Machine, MachineConfig, quick_exec


async def main():
    # Quick one-off execution
    print("=== Quick Execution ===")
    result = await quick_exec(["echo", "Hello from quick_exec!"])
    print(f"Output: {result.stdout}")
    print(f"Exit code: {result.exit_code}")
    print()

    # Using Machine with context manager
    print("=== Machine Context Manager ===")
    config = MachineConfig(name="example-machine")

    async with Machine(config) as machine:
        await machine.start()

        # Run commands directly in the VM
        result = await machine.exec(["uname", "-a"])
        print(f"VM info: {result.stdout}")

        # Run multiple commands
        result = await machine.exec(["ls", "-la", "/"])
        print(f"Root directory:\n{result.stdout}")


if __name__ == "__main__":
    asyncio.run(main())
