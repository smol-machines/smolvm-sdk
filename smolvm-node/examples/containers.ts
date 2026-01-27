/**
 * Container management example for smolvm SDK.
 *
 * Run with: npx ts-node examples/containers.ts
 */

import { Sandbox } from "../src/index.js";

async function main() {
  console.log("=== Container Management Example ===\n");

  // Create a sandbox with a mount point
  const sandbox = await Sandbox.create({
    name: "container-example",
    mounts: [{ source: "/tmp/smolvm-data", target: "/data" }],
  });

  try {
    // List available mounts
    console.log("1. Available mounts:");
    for (const mount of sandbox.mounts) {
      console.log(`   ${mount.tag}: ${mount.source} -> ${mount.target}`);
    }
    console.log("");

    // Pull an image
    console.log("2. Pulling alpine image...");
    const image = await sandbox.pullImage("alpine:latest");
    console.log(`   Pulled: ${image.reference}`);
    console.log(`   Size: ${(image.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Layers: ${image.layer_count}\n`);

    // List images
    console.log("3. Available images:");
    const images = await sandbox.listImages();
    for (const img of images) {
      console.log(`   - ${img.reference} (${img.architecture})`);
    }
    console.log("");

    // Create a container
    console.log("4. Creating container...");
    const container = await sandbox.createContainer({
      image: "alpine:latest",
      command: ["sh", "-c", "while true; do sleep 1; done"],
    });
    console.log(`   Container ID: ${container.id}`);
    console.log(`   State: ${container.state}\n`);

    // Start the container
    console.log("5. Starting container...");
    await container.start();
    await container.refresh();
    console.log(`   State: ${container.state}\n`);

    // Execute commands in the container
    console.log("6. Executing commands:");
    const whoami = await container.exec(["whoami"]);
    console.log(`   whoami: ${whoami.stdout.trim()}`);

    const hostname = await container.exec(["hostname"]);
    console.log(`   hostname: ${hostname.stdout.trim()}`);

    const uname = await container.exec(["uname", "-a"]);
    console.log(`   uname: ${uname.stdout.trim()}\n`);

    // List containers
    console.log("7. Listing containers:");
    const containers = await sandbox.listContainers();
    for (const c of containers) {
      console.log(`   - ${c.id.slice(0, 12)} (${c.image}): ${c.state}`);
    }
    console.log("");

    // Stop and delete container
    console.log("8. Stopping container...");
    await container.stop();
    await container.refresh();
    console.log(`   State: ${container.state}`);

    console.log("9. Deleting container...");
    await container.delete();
    console.log("   Deleted.\n");
  } finally {
    await sandbox.stop();
    await sandbox.delete();
    console.log("Sandbox cleaned up.");
  }

  console.log("\n=== Container Example Complete ===");
}

main().catch(console.error);
