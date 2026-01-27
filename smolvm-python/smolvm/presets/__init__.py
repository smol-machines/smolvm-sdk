"""Pre-configured sandbox presets for common use cases."""

from .node import node_sandbox
from .python import python_sandbox

__all__ = [
    "python_sandbox",
    "node_sandbox",
]
