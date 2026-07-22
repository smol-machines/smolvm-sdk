"""Unit tests for the fork/checkpoint surface — verify the exact HTTP requests
the client builds (path, query, body) without needing a live server. These guard
against API drift and shape mismatches with the server's /machines contract."""

import pytest

from smolvm import Machine, MachineConfig, SmolvmClient
from smolvm.types import ResourceSpec


def _capturing_client() -> tuple[SmolvmClient, list]:
    """A client whose `_request` records calls and returns a minimal machine info."""
    calls: list = []
    client = SmolvmClient()

    async def fake_request(method, path, body=None, timeout=None):
        calls.append({"method": method, "path": path, "body": body})
        name = path.rsplit("/", 1)[-1].split("?")[0] or "m"
        return {"name": name, "state": "running", "network": False, "cpus": 2, "memoryMb": 512}

    client._request = fake_request  # type: ignore[assignment]
    return client, calls


@pytest.mark.asyncio
async def test_create_sends_top_level_fields_to_machines():
    client, calls = _capturing_client()
    await client.create_machine(
        "g", image="python:3-alpine", resources=ResourceSpec(cpus=4, memory_mb=1024), network=True
    )
    c = calls[-1]
    assert c["method"] == "POST" and c["path"] == "/api/v1/machines"
    # cpus/memoryMb/network/image at the TOP level (not nested under "resources")
    assert c["body"]["cpus"] == 4 and c["body"]["memoryMb"] == 1024
    assert c["body"]["network"] is True and c["body"]["image"] == "python:3-alpine"
    assert "resources" not in c["body"]


@pytest.mark.asyncio
async def test_start_forkable_sets_query():
    client, calls = _capturing_client()
    await client.start_machine("g", forkable=True)
    assert calls[-1]["path"] == "/api/v1/machines/g/start?forkable=true"
    await client.start_machine("g")
    assert calls[-1]["path"] == "/api/v1/machines/g/start"


@pytest.mark.asyncio
async def test_fork_posts_to_golden_with_clone_name():
    client, calls = _capturing_client()
    await client.fork_machine("golden", "clone-1")
    c = calls[-1]
    assert c["method"] == "POST" and c["path"] == "/api/v1/machines/golden/fork"
    assert c["body"] == {"name": "clone-1"}


@pytest.mark.asyncio
async def test_machine_fork_returns_started_clone():
    golden = Machine(MachineConfig(name="golden", forkable=True))
    client, calls = _capturing_client()
    golden.client = client
    clone = await golden.fork("clone-a")
    assert isinstance(clone, Machine)
    assert clone.name == "clone-a"
    assert clone.is_started is True
    assert clone.config.forkable is False  # a clone is not itself a fork base
    assert calls[-1]["path"] == "/api/v1/machines/golden/fork"
