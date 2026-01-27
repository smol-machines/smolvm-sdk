#!/usr/bin/env python3
"""Example of using language presets for quick code execution."""

import asyncio

from smolvm.presets import python_sandbox, node_sandbox


async def main():
    # Python preset
    print("=== Python Sandbox ===")
    result = await python_sandbox("""
import sys
import json

data = {"language": "Python", "version": sys.version_info[:2]}
print(json.dumps(data, indent=2))
print("Hello from Python sandbox!")
""")
    print(result.stdout)
    print()

    # Node.js preset
    print("=== Node.js Sandbox ===")
    result = await node_sandbox("""
const data = {
    language: "JavaScript",
    version: process.version
};
console.log(JSON.stringify(data, null, 2));
console.log("Hello from Node.js sandbox!");
""")
    print(result.stdout)
    print()

    # Python with error handling
    print("=== Python with Error ===")
    result = await python_sandbox("""
import sys
print("This will print")
sys.exit(1)
""")
    print(f"Exit code: {result.exit_code}")
    print(f"Stdout: {result.stdout}")
    print(f"Success: {result.success}")


if __name__ == "__main__":
    asyncio.run(main())
