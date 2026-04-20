#!/usr/bin/env python3
"""Example of running containers within a smolvm machine."""

import asyncio

from smolvm import Machine, MachineConfig, quick_run


async def main():
    # Quick container run
    print("=== Quick Container Run ===")
    result = await quick_run(
        image="python:3.12-alpine",
        command=["python", "-c", "import sys; print(f'Python {sys.version}')"],
    )
    print(f"Output: {result.stdout}")
    print()

    # Using Machine for more control
    print("=== Machine with Multiple Containers ===")
    config = MachineConfig(name="container-example")

    async with Machine(config) as machine:
        await machine.start()

        # Pull images first (optional, happens automatically on run)
        print("Pulling alpine image...")
        await machine.pull_image("alpine:latest")

        # Run Python code
        print("\nRunning Python:")
        result = await machine.run(
            image="python:3.12-alpine",
            command=["python", "-c", "print('Hello from Python!')"],
        )
        print(f"  {result.stdout.strip()}")

        # Run Node.js code
        print("\nRunning Node.js:")
        result = await machine.run(
            image="node:22-alpine",
            command=["node", "-e", "console.log('Hello from Node.js!')"],
        )
        print(f"  {result.stdout.strip()}")

        # Run shell commands in Alpine
        print("\nRunning Alpine shell:")
        result = await machine.run(
            image="alpine:latest",
            command=["sh", "-c", "echo 'Hello from Alpine!' && cat /etc/os-release | head -2"],
        )
        print(f"  {result.stdout}")


if __name__ == "__main__":
    asyncio.run(main())
