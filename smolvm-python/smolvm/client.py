"""Low-level HTTP client for the smolvm API."""

from typing import Any, AsyncIterator, Optional
from urllib.parse import quote

import httpx

from .errors import ConnectionError, SmolvmError, TimeoutError, parse_api_error
from .types import ContainerInfo, ImageInfo, MountSpec, PortSpec, ResourceSpec, SandboxInfo

DEFAULT_TIMEOUT = 30.0  # seconds


class SmolvmClient:
    """Low-level HTTP client for the smolvm API."""

    def __init__(self, base_url: str = "http://127.0.0.1:8080"):
        """
        Initialize the client.

        Args:
            base_url: Base URL of the smolvm server (default: http://127.0.0.1:8080)
        """
        self.base_url = base_url.rstrip("/")
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=DEFAULT_TIMEOUT,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> "SmolvmClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict] = None,
        timeout: Optional[float] = None,
    ) -> Any:
        """Make an HTTP request to the API."""
        client = await self._get_client()
        url = path

        try:
            if body is not None:
                response = await client.request(
                    method, url, json=body, timeout=timeout or DEFAULT_TIMEOUT
                )
            else:
                response = await client.request(method, url, timeout=timeout or DEFAULT_TIMEOUT)

            if not response.is_success:
                try:
                    error_body = response.json()
                except Exception:
                    error_body = {"error": f"HTTP {response.status_code}: {response.reason_phrase}"}
                raise parse_api_error(response.status_code, error_body)

            # Handle empty responses
            if not response.content:
                return None

            return response.json()

        except httpx.TimeoutException as e:
            raise TimeoutError(f"Request timed out: {e}") from e
        except httpx.ConnectError as e:
            raise ConnectionError(f"Failed to connect to {self.base_url}: {e}") from e
        except SmolvmError:
            raise
        except Exception as e:
            raise ConnectionError(f"Request failed: {e}") from e

    # =========================================================================
    # Health
    # =========================================================================

    async def health(self) -> dict:
        """Check server health."""
        return await self._request("GET", "/health")

    # =========================================================================
    # Sandboxes
    # =========================================================================

    async def create_sandbox(
        self,
        name: str,
        mounts: Optional[list[MountSpec]] = None,
        ports: Optional[list[PortSpec]] = None,
        resources: Optional[ResourceSpec] = None,
    ) -> SandboxInfo:
        """Create a new sandbox."""
        body: dict[str, Any] = {"name": name}

        if mounts:
            body["mounts"] = [
                {"source": m.source, "target": m.target, "readonly": m.readonly} for m in mounts
            ]

        if ports:
            body["ports"] = [{"host": p.host, "guest": p.guest} for p in ports]

        if resources:
            body["resources"] = {"cpus": resources.cpus, "memoryMb": resources.memory_mb}

        data = await self._request("POST", "/api/v1/sandboxes", body)
        return SandboxInfo.from_dict(data)

    async def list_sandboxes(self) -> list[SandboxInfo]:
        """List all sandboxes."""
        data = await self._request("GET", "/api/v1/sandboxes")
        return [SandboxInfo.from_dict(s) for s in data.get("sandboxes", [])]

    async def get_sandbox(self, name: str) -> SandboxInfo:
        """Get sandbox by name."""
        data = await self._request("GET", f"/api/v1/sandboxes/{quote(name, safe='')}")
        return SandboxInfo.from_dict(data)

    async def start_sandbox(self, name: str) -> SandboxInfo:
        """Start a sandbox."""
        data = await self._request("POST", f"/api/v1/sandboxes/{quote(name, safe='')}/start")
        return SandboxInfo.from_dict(data)

    async def stop_sandbox(self, name: str) -> SandboxInfo:
        """Stop a sandbox."""
        data = await self._request("POST", f"/api/v1/sandboxes/{quote(name, safe='')}/stop")
        return SandboxInfo.from_dict(data)

    async def delete_sandbox(self, name: str) -> None:
        """Delete a sandbox."""
        await self._request("DELETE", f"/api/v1/sandboxes/{quote(name, safe='')}")

    # =========================================================================
    # Execution
    # =========================================================================

    async def exec(
        self,
        sandbox: str,
        command: list[str],
        env: Optional[dict[str, str]] = None,
        workdir: Optional[str] = None,
        timeout_secs: Optional[int] = None,
    ) -> dict:
        """Execute a command in the sandbox VM."""
        body: dict[str, Any] = {"command": command}

        if env:
            body["env"] = [{"name": k, "value": v} for k, v in env.items()]

        if workdir:
            body["workdir"] = workdir

        if timeout_secs:
            body["timeout_secs"] = timeout_secs

        # Use longer HTTP timeout if command timeout is specified
        http_timeout = (timeout_secs + 10) if timeout_secs else None

        return await self._request(
            "POST",
            f"/api/v1/sandboxes/{quote(sandbox, safe='')}/exec",
            body,
            timeout=http_timeout,
        )

    async def run(
        self,
        sandbox: str,
        image: str,
        command: list[str],
        env: Optional[dict[str, str]] = None,
        workdir: Optional[str] = None,
        timeout_secs: Optional[int] = None,
    ) -> dict:
        """Run a command in a container image within the sandbox."""
        body: dict[str, Any] = {"image": image, "command": command}

        if env:
            body["env"] = [{"name": k, "value": v} for k, v in env.items()]

        if workdir:
            body["workdir"] = workdir

        if timeout_secs:
            body["timeout_secs"] = timeout_secs

        http_timeout = (timeout_secs + 10) if timeout_secs else None

        return await self._request(
            "POST",
            f"/api/v1/sandboxes/{quote(sandbox, safe='')}/run",
            body,
            timeout=http_timeout,
        )

    async def stream_logs(
        self,
        sandbox: str,
        follow: bool = False,
        tail: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """Stream logs from a sandbox via SSE."""
        client = await self._get_client()

        params = {}
        if follow:
            params["follow"] = "true"
        if tail is not None:
            params["tail"] = str(tail)

        url = f"/api/v1/sandboxes/{quote(sandbox, safe='')}/logs"

        async with client.stream(
            "GET", url, params=params, headers={"Accept": "text/event-stream"}
        ) as response:
            if not response.is_success:
                try:
                    error_body = await response.json()
                except Exception:
                    error_body = {"error": f"HTTP {response.status_code}"}
                raise parse_api_error(response.status_code, error_body)

            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    yield line[6:]

    # =========================================================================
    # Containers
    # =========================================================================

    async def create_container(
        self,
        sandbox: str,
        image: str,
        command: Optional[list[str]] = None,
        env: Optional[dict[str, str]] = None,
        workdir: Optional[str] = None,
        mounts: Optional[list[dict]] = None,
    ) -> ContainerInfo:
        """Create a container in a sandbox."""
        body: dict[str, Any] = {"image": image}

        if command:
            body["command"] = command

        if env:
            body["env"] = [{"name": k, "value": v} for k, v in env.items()]

        if workdir:
            body["workdir"] = workdir

        if mounts:
            body["mounts"] = mounts

        data = await self._request(
            "POST", f"/api/v1/sandboxes/{quote(sandbox, safe='')}/containers", body
        )
        return ContainerInfo.from_dict(data)

    async def list_containers(self, sandbox: str) -> list[ContainerInfo]:
        """List containers in a sandbox."""
        data = await self._request(
            "GET", f"/api/v1/sandboxes/{quote(sandbox, safe='')}/containers"
        )
        return [ContainerInfo.from_dict(c) for c in data.get("containers", [])]

    async def start_container(self, sandbox: str, container_id: str) -> ContainerInfo:
        """Start a container."""
        data = await self._request(
            "POST",
            f"/api/v1/sandboxes/{quote(sandbox, safe='')}/containers/{quote(container_id, safe='')}/start",
        )
        return ContainerInfo.from_dict(data)

    async def stop_container(
        self, sandbox: str, container_id: str, timeout_secs: Optional[int] = None
    ) -> ContainerInfo:
        """Stop a container."""
        body = {"timeout_secs": timeout_secs} if timeout_secs else {}
        data = await self._request(
            "POST",
            f"/api/v1/sandboxes/{quote(sandbox, safe='')}/containers/{quote(container_id, safe='')}/stop",
            body,
        )
        return ContainerInfo.from_dict(data)

    async def delete_container(
        self, sandbox: str, container_id: str, force: bool = False
    ) -> None:
        """Delete a container."""
        body = {"force": force} if force else {}
        await self._request(
            "DELETE",
            f"/api/v1/sandboxes/{quote(sandbox, safe='')}/containers/{quote(container_id, safe='')}",
            body,
        )

    async def exec_container(
        self,
        sandbox: str,
        container_id: str,
        command: list[str],
        env: Optional[dict[str, str]] = None,
        workdir: Optional[str] = None,
        timeout_secs: Optional[int] = None,
    ) -> dict:
        """Execute a command in a container."""
        body: dict[str, Any] = {"command": command}

        if env:
            body["env"] = [{"name": k, "value": v} for k, v in env.items()]

        if workdir:
            body["workdir"] = workdir

        if timeout_secs:
            body["timeout_secs"] = timeout_secs

        http_timeout = (timeout_secs + 10) if timeout_secs else None

        return await self._request(
            "POST",
            f"/api/v1/sandboxes/{quote(sandbox, safe='')}/containers/{quote(container_id, safe='')}/exec",
            body,
            timeout=http_timeout,
        )

    # =========================================================================
    # Images
    # =========================================================================

    async def list_images(self, sandbox: str) -> list[ImageInfo]:
        """List images in a sandbox."""
        data = await self._request(
            "GET", f"/api/v1/sandboxes/{quote(sandbox, safe='')}/images"
        )
        return [ImageInfo.from_dict(i) for i in data.get("images", [])]

    async def pull_image(
        self,
        sandbox: str,
        image: str,
        platform: Optional[str] = None,
        timeout: float = 300.0,  # 5 minutes default for pulls
    ) -> ImageInfo:
        """Pull an image into a sandbox."""
        body: dict[str, Any] = {"image": image}
        if platform:
            body["platform"] = platform

        data = await self._request(
            "POST",
            f"/api/v1/sandboxes/{quote(sandbox, safe='')}/images/pull",
            body,
            timeout=timeout,
        )
        return ImageInfo.from_dict(data.get("image", data))
