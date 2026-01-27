"""smolvm - Python SDK for smolvm microVM sandboxes."""

from .client import SmolvmClient
from .errors import (
    BadRequestError,
    ConflictError,
    ConnectionError,
    ExecutionError,
    InternalError,
    NotFoundError,
    SmolvmError,
    TimeoutError,
)
from .execution import ExecResult
from .sandbox import Sandbox, quick_exec, quick_run, with_sandbox
from .types import (
    ContainerInfo,
    ContainerMountSpec,
    ContainerOptions,
    ContainerState,
    ExecOptions,
    ImageInfo,
    MountInfo,
    MountSpec,
    PortSpec,
    ResourceSpec,
    SandboxConfig,
    SandboxInfo,
    SandboxState,
)

__version__ = "0.1.0"

__all__ = [
    # Version
    "__version__",
    # Client
    "SmolvmClient",
    # Sandbox
    "Sandbox",
    "with_sandbox",
    "quick_exec",
    "quick_run",
    # Execution
    "ExecResult",
    # Types
    "SandboxConfig",
    "SandboxInfo",
    "SandboxState",
    "ContainerInfo",
    "ContainerState",
    "ContainerOptions",
    "ContainerMountSpec",
    "ImageInfo",
    "MountSpec",
    "MountInfo",
    "PortSpec",
    "ResourceSpec",
    "ExecOptions",
    # Errors
    "SmolvmError",
    "ConnectionError",
    "TimeoutError",
    "NotFoundError",
    "ConflictError",
    "BadRequestError",
    "InternalError",
    "ExecutionError",
]
