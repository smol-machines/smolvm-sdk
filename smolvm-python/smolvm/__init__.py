"""smolvm - Python SDK for smolvm microVM machines."""

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
from .machine import Machine, quick_exec, quick_run, with_machine
from .types import (
    ExecOptions,
    ImageInfo,
    MountInfo,
    MountSpec,
    PortSpec,
    ResourceSpec,
    MachineConfig,
    MachineInfo,
    MachineState,
)

__version__ = "0.1.0"

__all__ = [
    # Version
    "__version__",
    # Client
    "SmolvmClient",
    # Machine
    "Machine",
    "with_machine",
    "quick_exec",
    "quick_run",
    # Execution
    "ExecResult",
    # Types
    "MachineConfig",
    "MachineInfo",
    "MachineState",
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
