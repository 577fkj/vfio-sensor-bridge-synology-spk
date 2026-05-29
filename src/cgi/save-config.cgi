#!/usr/bin/env python3
"""POST /cgi/save-config.cgi — writes config JSON back to agent.toml.

Request body: JSON object produced by get-config.cgi (same schema).
The service is optionally restarted when "restart": true is included.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import auth
import agent_control

PKG_NAME = "vfio-sensor-bridge"
PKG_VAR = f"/var/packages/{PKG_NAME}/var"


# ── TOML serialiser ───────────────────────────────────────────────────────────

def _escape(s):
    """Escape backslashes and double-quotes for TOML string values."""
    return str(s).replace("\\", "\\\\").replace('"', '\\"')


def _str_list(lst):
    """Serialise a Python list of strings as a TOML inline array."""
    items = ", ".join(f'"{_escape(x)}"' for x in lst)
    return f"[{items}]"


def build_toml(config):
    """Serialise the config dict back to agent.toml text.

    The schema is fixed so we can write it deterministically without an
    external TOML library.
    """
    lines = []

    # ── [agent] ──────────────────────────────────────────────────────────────
    a = config.get("agent", {})
    lines += [
        "[agent]",
        f'virtio_port = "{_escape(a.get("virtio_port", "/dev/virtio-ports/org.vfio_sensor_bridge.0"))}"',
        f'scan_root = "{_escape(a.get("scan_root", "/sys/class/hwmon"))}"',
        f'hwmon_name_template = "{_escape(a.get("hwmon_name_template", "Synology"))}"',
        f'rescan_seconds = {int(a.get("rescan_seconds", 10))}',
        f'sample_seconds = {int(a.get("sample_seconds", 1))}',
        f'heartbeat_seconds = {int(a.get("heartbeat_seconds", 5))}',
        "",
    ]

    # ── [lsi_hba] ────────────────────────────────────────────────────────────
    h = config.get("lsi_hba", {})
    lines += [
        "[lsi_hba]",
        f'enabled = {"true" if h.get("enabled") else "false"}',
        f'devices = {_str_list(h.get("devices", ["/dev/mpt2ctl", "/dev/mpt3ctl"]))}',
        f'max_ioc = {int(h.get("max_ioc", 16))}',
        f'label_template = "{_escape(h.get("label_template", "{chip}"))}"',
        "",
    ]

    # ── [smartctl] ───────────────────────────────────────────────────────────
    s = config.get("smartctl", {})
    lines += [
        "[smartctl]",
        f'enabled = {"true" if s.get("enabled") else "false"}',
        f'command = "{_escape(s.get("command", "/usr/sbin/smartctl"))}"',
        f'device_globs = {_str_list(s.get("device_globs", ["/dev/sd*", "/dev/sata*"]))}',
        f'timeout_seconds = {int(s.get("timeout_seconds", 10))}',
        f'poll_seconds = {int(s.get("poll_seconds", 30))}',
        f'label_template = "{_escape(s.get("label_template", "{device} temperature"))}"',
        "",
    ]

    # ── [[persistent_sensor]] ─────────────────────────────────────────────────
    for ps in config.get("persistent_sensors", []):
        src = ps.get("source", {})
        src_type = src.get("type", "hwmon")
        lines += [
            "[[persistent_sensor]]",
            f'id = "{_escape(ps.get("id", ""))}"',
            f'kind = "{_escape(ps.get("kind", "temperature"))}"',
            f'label = "{_escape(ps.get("label", ""))}"',
            f'default_value = {int(ps.get("default_value", 0))}',
            "[persistent_sensor.source]",
            f'type = "{_escape(src_type)}"',
        ]
        if src_type == "smartctl":
            lines.append(f'device = "{_escape(src.get("device", ""))}"')
        elif src_type == "lsi_hba":
            lines.append(f'device = "{_escape(src.get("device", ""))}"')
            lines.append(f'ioc = {int(src.get("ioc", 0))}')
        else:
            for k in ("chip_name", "input", "source_label", "device_path_contains"):
                if k in src and src[k]:
                    lines.append(f'{k} = "{_escape(src[k])}"')
        lines.append("")

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Content-type: application/json\n")

    if not auth.check():
        sys.exit(0)

    try:
        content_length = int(os.environ.get("CONTENT_LENGTH", 0))
        body = sys.stdin.read(content_length) if content_length > 0 else sys.stdin.read()
        payload = json.loads(body)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid request body: {e}"}))
        sys.exit(0)

    config = payload.get("config", payload)  # accept both {config: {...}} and raw config
    should_restart = bool(payload.get("restart", False))
    raw_content = payload.get("raw_content")  # raw TOML string from config editor tab

    config_path = os.path.join(PKG_VAR, "agent.toml")

    try:
        if raw_content is not None:
            toml_text = raw_content
        else:
            toml_text = build_toml(config)

        # Write atomically via a temp file
        tmp_path = config_path + ".tmp"
        with open(tmp_path, "w") as f:
            f.write(toml_text)
        os.replace(tmp_path, config_path)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Failed to write config: {e}"}))
        sys.exit(0)

    # Optionally restart the service to apply changes
    if should_restart:
        result = agent_control.restart_agent()
        if not result.get("success"):
            print(json.dumps(result))
            sys.exit(0)

    print(json.dumps({"success": True}))
