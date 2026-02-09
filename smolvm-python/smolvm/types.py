"""Type definitions for the smolvm SDK.

API types are re-exported from the generated OpenAPI models.
SDK-specific types (helper configs, options) are defined here.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

# Re-export generated API types
from smolvm.generated import (
    ContainerInfo as GeneratedContainerInfo,
    ImageInfo as GeneratedImageInfo,
    MicrovmInfo as GeneratedMicrovmInfo,
    MountInfo as GeneratedMountInfo,
    MountSpec as GeneratedMountSpec,
    PortSpec as GeneratedPortSpec,
    ResourceSpec as GeneratedResourceSpec,
    SandboxInfo as GeneratedSandboxInfo,
    ExecResponse,
    HealthResponse,
)

# ============================================================================
# SDK-specific Enums (for ergonomic access to state values)
# ============================================================================


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


class MicrovmState(str, Enum):
    """State of a microvm."""

    CREATED = "created"
    RUNNING = "running"
    STOPPED = "stopped"


# ============================================================================
# SDK-specific Types (not in API, for convenience)
# ============================================================================


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
    """Resource allocation specification.

    All fields are optional — the server applies its own defaults when omitted.
    """

    cpus: Optional[int] = None
    memory_mb: Optional[int] = None
    network: Optional[bool] = None


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
    network: bool  # Whether outbound network access is enabled
    pid: Optional[int] = None
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
            cpus=resources_data.get("cpus"),
            memory_mb=resources_data.get("memory_mb"),
            network=resources_data.get("network"),
        )
        return cls(
            name=data["name"],
            state=SandboxState(data["state"]),
            mounts=mounts,
            ports=ports,
            resources=resources,
            network=data.get("network", False),
            pid=data.get("pid"),
            restart_count=data.get("restart_count"),
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
class MicrovmInfo:
    """Information about a microvm."""

    name: str
    state: MicrovmState
    cpus: int
    memory_mb: int
    pid: Optional[int]
    mounts: int
    ports: int
    network: bool  # Whether outbound network access is enabled
    created_at: str

    @classmethod
    def from_dict(cls, data: dict) -> "MicrovmInfo":
        """Create MicrovmInfo from API response dict."""
        return cls(
            name=data["name"],
            state=MicrovmState(data["state"]),
            cpus=data["cpus"],
            memory_mb=data["memoryMb"],
            pid=data.get("pid"),
            mounts=data["mounts"],
            ports=data["ports"],
            network=data.get("network", False),
            created_at=data["created_at"],
        )


# ============================================================================
# SDK Helper Types
# ============================================================================


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
    network: bool = False  # Enable outbound network access (TCP/UDP only, not ICMP)


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


# ============================================================================
# Re-exported Generated Types (for API compatibility validation)
# ============================================================================

# These are the Pydantic models from the generated OpenAPI code.
# They can be used for strict validation or when Pydantic integration is needed.
GeneratedSandboxInfo = GeneratedSandboxInfo
GeneratedContainerInfo = GeneratedContainerInfo
GeneratedImageInfo = GeneratedImageInfo
GeneratedMicrovmInfo = GeneratedMicrovmInfo
GeneratedMountInfo = GeneratedMountInfo
GeneratedMountSpec = GeneratedMountSpec
GeneratedPortSpec = GeneratedPortSpec
GeneratedResourceSpec = GeneratedResourceSpec
