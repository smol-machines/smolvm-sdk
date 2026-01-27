/**
 * Basic usage example for smolvm SDK.
 *
 * Run with: npx ts-node examples/basic.ts
 */

import { Sandbox, withSandbox, quickExec } from "../src/index.js";

async function main() {
  console.log("=== Basic Sandbox Example ===\n");

  // Example 1: Manual lifecycle management
  console.log("1. Manual sandbox management:");
  const sandbox = await Sandbox.create({ name: "basic-example" });

  try {
    // Execute a simple command
    const result = await sandbox.exec(["echo", "Hello from smolvm!"]);
    console.log(`   Output: ${result.stdout.trim()}`);
    console.log(`   Exit code: ${result.exitCode}`);
    console.log(`   Success: ${result.success}`);

    // Execute multiple commands
    const uname = await sandbox.exec(["uname", "-a"]);
    console.log(`   System: ${uname.stdout.trim()}`);
  } finally {
    await sandbox.stop();
    await sandbox.delete();
    console.log("   Sandbox cleaned up.\n");
  }

  // Example 2: Using withSandbox helper
  console.log("2. Using withSandbox helper:");
  const result = await withSandbox({ name: "helper-example" }, async (sb) => {
    return sb.exec(["hostname"]);
  });
  console.log(`   Hostname: ${result.stdout.trim()}`);
  console.log("   Sandbox auto-cleaned up.\n");

  // Example 3: Quick execution
  console.log("3. Quick execution:");
  const quickResult = await quickExec(["date"]);
  console.log(`   Date: ${quickResult.stdout.trim()}\n`);

  // Example 4: Error handling with assertSuccess
  console.log("4. Using assertSuccess:");
  try {
    const assertResult = await withSandbox(
      { name: "assert-example" },
      async (sb) => {
        const res = await sb.exec(["true"]);
        return res.assertSuccess(); // Returns this if successful
      }
    );
    console.log(`   Command succeeded with exit code: ${assertResult.exitCode}`);
  } catch (error) {
    console.log(`   Command failed: ${error}`);
  }

  console.log("\n=== Examples Complete ===");
}

main().catch(console.error);
