"""Pre-configured machine presets for common use cases."""

from .node import node_machine
from .python import python_machine

__all__ = [
    "python_machine",
    "node_machine",
]
