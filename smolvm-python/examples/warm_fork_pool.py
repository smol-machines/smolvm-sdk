#!/usr/bin/env python3
"""Warm-fork machine pool — the agent-sandbox / RL-environment pattern.

A forkable machine is a warm CHECKPOINT: boot it once (paying cold start and any
workload warm-up a single time), then fork it into as many clones as you need.
Each clone boots from the golden's live copy-on-write memory — no cold start —
and inherits its warm workload.

  * checkpoint = a machine started with forkable=True (frozen, resident base)
  * branch/fork = a warm clone of the checkpoint
  * rollback   = discard a clone and branch a fresh one from the checkpoint

Bake the warm workload (a server, a loaded REPL, a browser) into the image's CMD
so it is already running in the golden at fork time.

Prereq: a running server -> `smolvm serve` (default http://127.0.0.1:8080).
"""

import asyncio

from smolvm import Machine, MachineConfig


async def main():
    # 1. Warm a forkable golden. Its image CMD runs as the persistent workload,
    #    so whatever the image starts is already warm when we fork.
    golden = Machine(
        MachineConfig(
            name="pool-golden",
            image="docker.io/library/python:3-alpine",
            network=True,
            forkable=True,  # <- start as a warm checkpoint
        )
    )
    await golden.start()
    print("golden warm and frozen as a fork base")

    # 2. Fork a pool of warm clones concurrently. Each is a live, isolated microVM
    #    that shares the golden's RAM copy-on-write — typically ~tens of ms each.
    clones = await golden.fork_many(8)  # pool-golden-0 .. pool-golden-7
    print(f"forked {len(clones)} warm clones")

    try:
        # 3. Run untrusted / per-task work in each clone, in parallel.
        async def task(i: int, m: Machine) -> str:
            r = await m.exec(["python3", "-c", f"print({i} * {i})"])
            return r.stdout.strip()

        results = await asyncio.gather(*(task(i, c) for i, c in enumerate(clones)))
        print("clone results:", results)

        # 4. RL / tree-search rollback: branch a working copy, explore, throw it
        #    away, and branch again to return to the warm checkpoint.
        branch = await golden.branch()
        await branch.exec(["sh", "-c", "echo 'stepping the env...'"])
        await branch.delete()  # rollback: discard this trajectory
        fresh = await golden.branch()  # back to the checkpoint, warm
        print("rolled back to a fresh warm branch:", fresh.name)
        await fresh.delete()
    finally:
        for c in clones:
            await c.delete()
        await golden.delete()


if __name__ == "__main__":
    asyncio.run(main())
