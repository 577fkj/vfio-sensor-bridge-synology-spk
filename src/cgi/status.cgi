#!/usr/bin/env python3
"""GET /cgi/status.cgi — returns service and SPM status."""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import auth
import agent_control

PKG_NAME = "vfio-sensor-bridge"

def _service_status():
    """Return True if the package service is running."""
    if agent_control.package_service_pid():
        return True

    try:
        result = subprocess.run(
            ["synopkg", "status", PKG_NAME],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
            check=False,
        )
        output = result.stdout.decode(errors="replace").lower()
        if "stopped" in output:
            return False
        return "started" in output or "running" in output
    except Exception:
        return False


def _virtio_device():
    """Return whether the configured virtio port device exists."""
    port = agent_control.configured_virtio_port()
    return os.path.exists(port), port


def _log_tail(n=80):
    """Return the last n lines of the agent log."""
    return agent_control.log_tail(n)


if __name__ == "__main__":
    print("Content-type: application/json\n")

    if not auth.check():
        sys.exit(0)

    device_exists, virtio_port = _virtio_device()
    spm_ready, spm_message = agent_control.spm_status()
    agent = agent_control.agent_status()

    payload = {
        "success": True,
        "service_running": _service_status(),
        "agent_running": agent["running"],
        "agent_pid": agent["pid"],
        "spm_ready": spm_ready,
        "spm_message": spm_message,
        "virtio_device_exists": device_exists,
        "virtio_port": virtio_port,
        "pid_file": agent["pid_file"],
        "log_file": agent["log_file"],
        "log_tail": _log_tail(),
        "autostart_enabled": agent_control.get_autostart(),
    }
    print(json.dumps(payload, indent=2))
