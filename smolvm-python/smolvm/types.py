"""Type definitions for the smolvm SDK."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class SandboxState(str, Enum):
    """State of a sandbox."""

    CREATED = "created"
    RUNNING = "running"
    STOPPED = "stopped"


class ContainerState(str, Enum):
    """State of a container."""

    CREATED = "created"
    RUNNING = "running"
    STOPPED = "stopped"


@dataclass
class MountSpec:
    """Volume mount specification."""

    source: str  # Host path
    target: str  # Sandbox path
    readonly: bool = False


@dataclass
class PortSpec:
    """Port forwarding specification."""

    host: int
    guest: int


@dataclass
class ResourceSpec:
    """Resource allocation specification."""

    cpus: int = 1
    memory_mb: int = 256


@dataclass
class MountInfo:
    """Information about a mount in a sandbox."""

    tag: str  # "smolvm0", "smolvm1", etc.
    source: str
    target: str
    readonly: bool


@dataclass
class SandboxInfo:
    """Information about a sandbox."""

    name: str
    state: SandboxState
    mounts: list[MountInfo]
    ports: list[PortSpec]
    resources: ResourceSpec
    pid: Optional[int] = None
    uptime_secs: Optional[int] = None
    restart_count: Optional[int] = None

    @classmethod
    def from_dict(cls, data: dict) -> "SandboxInfo":
        """Create SandboxInfo from API response dict."""
        mounts = [
            MountInfo(
                tag=m["tag"],
                source=m["source"],
                target=m["target"],
                readonly=m.get("readonly", False),
            )
            for m in data.get("mounts", [])
        ]
        ports = [PortSpec(host=p["host"], guest=p["guest"]) for p in data.get("ports", [])]
        resources_data = data.get("resources", {})
        resources = ResourceSpec(
            cpus=resources_data.get("cpus", 1),
            memory_mb=resources_data.get("memoryMb", 256),
        )
        return cls(
            name=data["name"],
            state=SandboxState(data["state"]),
            mounts=mounts,
            ports=ports,
            resources=resources,
            pid=data.get("pid"),
            uptime_secs=data.get("uptimeSecs"),
            restart_count=data.get("restartCount"),
        )


@dataclass
class ContainerInfo:
    """Information about a container."""

    id: str
    image: str
    state: ContainerState
    created_at: int
    command: list[str]

    @classmethod
    def from_dict(cls, data: dict) -> "ContainerInfo":
        """Create ContainerInfo from API response dict."""
        return cls(
            id=data["id"],
            image=data["image"],
            state=ContainerState(data["state"]),
            created_at=data["created_at"],
            command=data.get("command", []),
        )


@dataclass
class ImageInfo:
    """Information about an OCI image."""

    reference: str
    digest: str
    size: int
    architecture: str
    os: str
    layer_count: int

    @classmethod
    def from_dict(cls, data: dict) -> "ImageInfo":
        """Create ImageInfo from API response dict."""
        return cls(
            reference=data["reference"],
            digest=data["digest"],
            size=data["size"],
            architecture=data["architecture"],
            os=data["os"],
            layer_count=data["layer_count"],
        )


@dataclass
class ExecOptions:
    """Options for command execution."""

    env: Optional[dict[str, str]] = None
    workdir: Optional[str] = None
    timeout: Optional[int] = None  # seconds


@dataclass
class SandboxConfig:
    """Configuration for creating a sandbox."""

    name: str
    server_url: str = "http://127.0.0.1:8080"
    mounts: list[MountSpec] = field(default_factory=list)
    ports: list[PortSpec] = field(default_factory=list)
    resources: Optional[ResourceSpec] = None


@dataclass
class ContainerMountSpec:
    """Mount specification for containers."""

    source: str  # Virtiofs tag (e.g., "smolvm0")
    target: str
    readonly: bool = False


@dataclass
class ContainerOptions:
    """Options for creating a container."""

    image: str
    command: Optional[list[str]] = None
    env: Optional[dict[str, str]] = None
    workdir: Optional[str] = None
    mounts: Optional[list[ContainerMountSpec]] = None
