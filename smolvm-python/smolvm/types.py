"""Type definitions for the smolvm SDK.

API types are re-exported from the generated OpenAPI models.
SDK-specific types (helper configs, options) are defined here.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

# Re-export generated API types
from smolvm.generated import (
    ImageInfo as GeneratedImageInfo,
    SandboxInfo as GeneratedMachineInfo,  # generated code still uses old name
    MountInfo as GeneratedMountInfo,
    MountSpec as GeneratedMountSpec,
    PortSpec as GeneratedPortSpec,
    ResourceSpec as GeneratedResourceSpec,
    ExecResponse,
    HealthResponse,
)

# ============================================================================
# SDK-specific Enums (for ergonomic access to state values)
# ============================================================================


class MachineState(str, Enum):
    """State of a machine."""

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
    target: str  # Machine path
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
    """Information about a mount in a machine."""

    tag: str  # "smolvm0", "smolvm1", etc.
    source: str
    target: str
    readonly: bool


@dataclass
class MachineInfo:
    """Information about a machine."""

    name: str
    state: MachineState
    mounts: list[MountInfo]
    ports: list[PortSpec]
    resources: ResourceSpec
    network: bool  # Whether outbound network access is enabled
    pid: Optional[int] = None
    restart_count: Optional[int] = None

    @classmethod
    def from_dict(cls, data: dict) -> "MachineInfo":
        """Create MachineInfo from API response dict."""
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
            memory_mb=resources_data.get("memoryMb"),
            network=resources_data.get("network"),
        )
        return cls(
            name=data["name"],
            state=MachineState(data["state"]),
            mounts=mounts,
            ports=ports,
            resources=resources,
            network=data.get("network", False),
            pid=data.get("pid"),
            restart_count=data.get("restartCount"),
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
            layer_count=data["layerCount"],
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
class MachineConfig:
    """Configuration for creating a machine."""

    name: str
    server_url: str = "http://127.0.0.1:8080"
    mounts: list[MountSpec] = field(default_factory=list)
    ports: list[PortSpec] = field(default_factory=list)
    resources: Optional[ResourceSpec] = None
    network: bool = False  # Enable outbound network access (TCP/UDP only, not ICMP)


# ============================================================================
# Re-exported Generated Types (for API compatibility validation)
# ============================================================================

GeneratedMachineInfo = GeneratedMachineInfo
GeneratedImageInfo = GeneratedImageInfo
GeneratedMountInfo = GeneratedMountInfo
GeneratedMountSpec = GeneratedMountSpec
GeneratedPortSpec = GeneratedPortSpec
GeneratedResourceSpec = GeneratedResourceSpec
