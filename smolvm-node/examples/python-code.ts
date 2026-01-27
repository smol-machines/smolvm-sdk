/**
 * Python sandbox example for smolvm SDK.
 *
 * Run with: npx ts-node examples/python-code.ts
 */

import { PythonSandbox } from "../src/index.js";

async function main() {
  console.log("=== Python Sandbox Example ===\n");

  const sandbox = await PythonSandbox.create({ name: "python-example" });

  try {
    // Check Python version
    console.log("1. Python version:");
    const version = await sandbox.version();
    console.log(`   ${version}\n`);

    // Run simple Python code
    console.log("2. Simple calculation:");
    const calcResult = await sandbox.runCode(`
result = sum(range(1, 101))
print(f"Sum of 1 to 100 = {result}")
    `);
    console.log(`   ${calcResult.stdout.trim()}\n`);

    // Run code with imports
    console.log("3. Using standard library:");
    const jsonResult = await sandbox.runCode(`
import json
data = {"name": "smolvm", "version": "0.1.0", "features": ["fast", "secure"]}
print(json.dumps(data, indent=2))
    `);
    console.log(`   ${jsonResult.stdout}\n`);

    // Run code with setup
    console.log("4. Code with setup:");
    const setupResult = await sandbox.runWithSetup(
      `
# Setup code
import math
PI = math.pi
      `,
      `
# Main code
print(f"Pi = {PI}")
print(f"Circle area (r=5) = {PI * 5**2:.2f}")
      `
    );
    console.log(`   ${setupResult.stdout.trim()}\n`);

    // List packages
    console.log("5. Installed packages (first 5):");
    const packages = await sandbox.listPackages();
    packages.slice(0, 5).forEach((pkg) => {
      console.log(`   - ${pkg}`);
    });
    console.log("");

    // Handle errors gracefully
    console.log("6. Error handling:");
    const errorResult = await sandbox.runCode(`
try:
    x = 1 / 0
except ZeroDivisionError as e:
    print(f"Caught error: {e}")
    `);
    console.log(`   ${errorResult.stdout.trim()}\n`);
  } finally {
    await sandbox.stop();
    await sandbox.delete();
    console.log("Sandbox cleaned up.");
  }

  console.log("\n=== Python Example Complete ===");
}

main().catch(console.error);
