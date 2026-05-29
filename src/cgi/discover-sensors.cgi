#!/usr/bin/env python3
"""GET /cgi/discover-sensors.cgi — discovers persistent sensor candidates."""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import auth
import agent_control

DISCOVER_CACHE = "/run/vfio-sensor-bridge/agent-discover.json"


def _read_cache():
    try:
        with open(DISCOVER_CACHE, "r", encoding="utf-8") as f:
            return f.read()
    except PermissionError:
        result = subprocess.run(
            [agent_control.SPM_EXEC, "/bin/cat", DISCOVER_CACHE],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode(errors="replace").strip())
        return result.stdout.decode(errors="replace")


if __name__ == "__main__":
    print("Content-type: application/json\n")

    if not auth.check():
        sys.exit(0)

    agent_control.ensure_config()
    ready, spm_msg = agent_control.spm_status()
    if not ready:
        print(json.dumps({"success": False, "error": spm_msg}))
        sys.exit(0)

    if not os.path.exists(agent_control.AGENT_BIN):
        print(json.dumps({"success": False, "error": f"{agent_control.AGENT_BIN} not found"}))
        sys.exit(0)

    try:
        result = subprocess.run(
            [
                agent_control.SPM_EXEC,
                agent_control.AGENT_BIN,
                "config",
                "persistent",
                "discover",
                "--config",
                agent_control.AGENT_CONFIG,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
            check=False,
        )
        output = (
            result.stdout.decode(errors="replace")
            + result.stderr.decode(errors="replace")
        ).strip()
        if result.returncode != 0:
            print(json.dumps({"success": False, "error": output or "discover failed"}))
            sys.exit(0)

        sensors = json.loads(_read_cache())
        print(json.dumps({"success": True, "sensors": sensors}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
