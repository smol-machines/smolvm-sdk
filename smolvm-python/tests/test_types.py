"""Tests for type definitions."""

import pytest

from smolvm.types import (
    ContainerInfo,
    ContainerState,
    ImageInfo,
    MountInfo,
    MountSpec,
    PortSpec,
    ResourceSpec,
    MachineConfig,
    MachineInfo,
    MachineState,
)


class TestMountSpec:
    def test_default_readonly(self):
        mount = MountSpec(source="/host", target="/guest")
        assert mount.source == "/host"
        assert mount.target == "/guest"
        assert mount.readonly is False

    def test_readonly_mount(self):
        mount = MountSpec(source="/host", target="/guest", readonly=True)
        assert mount.readonly is True


class TestPortSpec:
    def test_port_spec(self):
        port = PortSpec(host=8080, guest=80)
        assert port.host == 8080
        assert port.guest == 80


class TestResourceSpec:
    def test_defaults(self):
        resources = ResourceSpec()
        assert resources.cpus == 1
        assert resources.memory_mb == 256

    def test_custom_values(self):
        resources = ResourceSpec(cpus=4, memory_mb=2048)
        assert resources.cpus == 4
        assert resources.memory_mb == 2048


class TestMachineConfig:
    def test_minimal_config(self):
        config = MachineConfig(name="test")
        assert config.name == "test"
        assert config.server_url == "http://127.0.0.1:8080"
        assert config.mounts == []
        assert config.ports == []
        assert config.resources is None

    def test_full_config(self):
        config = MachineConfig(
            name="test",
            server_url="http://localhost:9000",
            mounts=[MountSpec(source="/a", target="/b")],
            ports=[PortSpec(host=8080, guest=80)],
            resources=ResourceSpec(cpus=2, memory_mb=512),
        )
        assert config.name == "test"
        assert config.server_url == "http://localhost:9000"
        assert len(config.mounts) == 1
        assert len(config.ports) == 1
        assert config.resources.cpus == 2


class TestMachineInfo:
    def test_from_dict_minimal(self):
        data = {
            "name": "test-machine",
            "state": "running",
        }
        info = MachineInfo.from_dict(data)
        assert info.name == "test-machine"
        assert info.state == MachineState.RUNNING
        assert info.mounts == []
        assert info.ports == []
        assert info.pid is None

    def test_from_dict_full(self):
        data = {
            "name": "test-machine",
            "state": "running",
            "mounts": [
                {"tag": "smolvm0", "source": "/host", "target": "/guest", "readonly": True}
            ],
            "ports": [{"host": 8080, "guest": 80}],
            "resources": {"cpus": 2, "memoryMb": 1024},
            "pid": 12345,
            "uptimeSecs": 100,
            "restartCount": 0,
        }
        info = MachineInfo.from_dict(data)
        assert info.name == "test-machine"
        assert info.state == MachineState.RUNNING
        assert len(info.mounts) == 1
        assert info.mounts[0].tag == "smolvm0"
        assert info.mounts[0].readonly is True
        assert len(info.ports) == 1
        assert info.ports[0].host == 8080
        assert info.resources.cpus == 2
        assert info.resources.memory_mb == 1024
        assert info.pid == 12345
        assert info.uptime_secs == 100


class TestContainerInfo:
    def test_from_dict(self):
        data = {
            "id": "abc123",
            "image": "alpine:latest",
            "state": "running",
            "created_at": 1700000000,
            "command": ["sh", "-c", "echo hello"],
        }
        info = ContainerInfo.from_dict(data)
        assert info.id == "abc123"
        assert info.image == "alpine:latest"
        assert info.state == ContainerState.RUNNING
        assert info.created_at == 1700000000
        assert info.command == ["sh", "-c", "echo hello"]


class TestImageInfo:
    def test_from_dict(self):
        data = {
            "reference": "python:3.12-alpine",
            "digest": "sha256:abc123",
            "size": 50000000,
            "architecture": "amd64",
            "os": "linux",
            "layerCount": 5,
        }
        info = ImageInfo.from_dict(data)
        assert info.reference == "python:3.12-alpine"
        assert info.digest == "sha256:abc123"
        assert info.size == 50000000
        assert info.architecture == "amd64"
        assert info.os == "linux"
        assert info.layer_count == 5


class TestMachineState:
    def test_values(self):
        assert MachineState.CREATED == "created"
        assert MachineState.RUNNING == "running"
        assert MachineState.STOPPED == "stopped"


class TestContainerState:
    def test_values(self):
        assert ContainerState.CREATED == "created"
        assert ContainerState.RUNNING == "running"
        assert ContainerState.STOPPED == "stopped"
