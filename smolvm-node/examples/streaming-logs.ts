/**
 * Log streaming example for smolvm SDK.
 *
 * Run with: npx ts-node examples/streaming-logs.ts
 */

import { Sandbox } from "../src/index.js";

async function main() {
  console.log("=== Log Streaming Example ===\n");

  const sandbox = await Sandbox.create({ name: "logs-example" });

  try {
    // Start a process that generates continuous output
    console.log("1. Starting background process...");
    // Note: This exec call returns immediately since we're not awaiting
    // the long-running command. In practice, you'd want to handle this
    // differently based on your use case.
    const execPromise = sandbox.exec([
      "sh",
      "-c",
      'for i in $(seq 1 10); do echo "Log entry $i at $(date)"; sleep 1; done',
    ]);
    console.log("   Process started.\n");

    // Stream logs
    console.log("2. Streaming logs:");
    const controller = new AbortController();

    // Set a timeout to stop streaming
    const timeout = setTimeout(() => {
      console.log("\n   [Stopping log stream after timeout]");
      controller.abort();
    }, 12000); // 12 seconds

    try {
      for await (const line of sandbox.logs({ follow: true })) {
        console.log(`   [LOG] ${line}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Expected when we abort
      } else {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }

    // Wait for the exec to complete
    const result = await execPromise;
    console.log(`\n3. Process completed with exit code: ${result.exitCode}`);

    // Get historical logs (tail)
    console.log("\n4. Getting last 5 log entries:");
    for await (const line of sandbox.logs({ tail: 5 })) {
      console.log(`   ${line}`);
    }
  } finally {
    await sandbox.stop();
    await sandbox.delete();
    console.log("\nSandbox cleaned up.");
  }

  console.log("\n=== Log Streaming Example Complete ===");
}

main().catch(console.error);
