"""Low-level HTTP client for the smolvm API."""

from typing import Any, AsyncIterator, Optional
from urllib.parse import quote

import httpx

from .errors import ConnectionError, SmolvmError, TimeoutError, parse_api_error
from .types import ImageInfo, MachineInfo, MountSpec, PortSpec, ResourceSpec

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
    # Machines
    # =========================================================================

    async def create_machine(
        self,
        name: str,
        mounts: Optional[list[MountSpec]] = None,
        ports: Optional[list[PortSpec]] = None,
        resources: Optional[ResourceSpec] = None,
        network: bool = False,
    ) -> MachineInfo:
        """Create a new machine.

        Args:
            name: Unique name for the machine
            mounts: Host mounts to attach
            ports: Port mappings (host:guest)
            resources: VM resource configuration (cpus, memory)
            network: Enable outbound network access (TCP/UDP only, not ICMP)

        Returns:
            MachineInfo with the created machine details
        """
        body: dict[str, Any] = {"name": name}

        if mounts:
            body["mounts"] = [
                {"source": m.source, "target": m.target, "readonly": m.readonly} for m in mounts
            ]

        if ports:
            body["ports"] = [{"host": p.host, "guest": p.guest} for p in ports]

        if resources or network:
            res: dict[str, Any] = {}
            if resources:
                if resources.cpus is not None:
                    res["cpus"] = resources.cpus
                if resources.memory_mb is not None:
                    res["memory_mb"] = resources.memory_mb
                if resources.network is not None:
                    res["network"] = resources.network
            # Explicit network param overrides resources.network
            if network:
                res["network"] = True
            if res:
                body["resources"] = res

        data = await self._request("POST", "/api/v1/machines", body)
        return MachineInfo.from_dict(data)

    async def list_machines(self) -> list[MachineInfo]:
        """List all machines."""
        data = await self._request("GET", "/api/v1/machines")
        return [MachineInfo.from_dict(s) for s in data.get("machines", [])]

    async def get_machine(self, name: str) -> MachineInfo:
        """Get machine by name."""
        data = await self._request("GET", f"/api/v1/machines/{quote(name, safe='')}")
        return MachineInfo.from_dict(data)

    async def start_machine(self, name: str) -> MachineInfo:
        """Start a machine."""
        data = await self._request("POST", f"/api/v1/machines/{quote(name, safe='')}/start")
        return MachineInfo.from_dict(data)

    async def stop_machine(self, name: str) -> MachineInfo:
        """Stop a machine."""
        data = await self._request("POST", f"/api/v1/machines/{quote(name, safe='')}/stop")
        return MachineInfo.from_dict(data)

    async def delete_machine(self, name: str, force: bool = False) -> None:
        """Delete a machine.

        Args:
            name: Machine name
            force: Force delete even if VM is still running (may orphan the process)
        """
        path = f"/api/v1/machines/{quote(name, safe='')}"
        if force:
            path += "?force=true"
        await self._request("DELETE", path)

    # =========================================================================
    # Execution
    # =========================================================================

    async def exec(
        self,
        machine: str,
        command: list[str],
        env: Optional[dict[str, str]] = None,
        workdir: Optional[str] = None,
        timeout_secs: Optional[int] = None,
    ) -> dict:
        """Execute a command in the machine VM."""
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
            f"/api/v1/machines/{quote(machine, safe='')}/exec",
            body,
            timeout=http_timeout,
        )

    async def run(
        self,
        machine: str,
        image: str,
        command: list[str],
        env: Optional[dict[str, str]] = None,
        workdir: Optional[str] = None,
        timeout_secs: Optional[int] = None,
    ) -> dict:
        """Run a command in a container image within the machine."""
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
            f"/api/v1/machines/{quote(machine, safe='')}/run",
            body,
            timeout=http_timeout,
        )

    async def stream_logs(
        self,
        machine: str,
        follow: bool = False,
        tail: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """Stream logs from a machine via SSE."""
        client = await self._get_client()

        params = {}
        if follow:
            params["follow"] = "true"
        if tail is not None:
            params["tail"] = str(tail)

        url = f"/api/v1/machines/{quote(machine, safe='')}/logs"

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
    # Images
    # =========================================================================

    async def list_images(self, machine: str) -> list[ImageInfo]:
        """List images in a machine."""
        data = await self._request(
            "GET", f"/api/v1/machines/{quote(machine, safe='')}/images"
        )
        return [ImageInfo.from_dict(i) for i in data.get("images", [])]

    async def pull_image(
        self,
        machine: str,
        image: str,
        oci_platform: Optional[str] = None,
        timeout: float = 300.0,  # 5 minutes default for pulls
    ) -> ImageInfo:
        """Pull an image into a machine."""
        body: dict[str, Any] = {"image": image}
        if oci_platform:
            body["oci_platform"] = oci_platform

        data = await self._request(
            "POST",
            f"/api/v1/machines/{quote(machine, safe='')}/images/pull",
            body,
            timeout=timeout,
        )
        return ImageInfo.from_dict(data.get("image", data))

