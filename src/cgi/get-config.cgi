#!/usr/bin/env python3
"""GET /cgi/get-config.cgi — reads agent.toml and returns it as JSON."""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import auth

PKG_NAME = "vfio-sensor-bridge"
PKG_VAR = f"/var/packages/{PKG_NAME}/var"
PKG_DEST = f"/var/packages/{PKG_NAME}/target"


def _parse_string_list(value):
    """Parse a TOML inline array of strings: ["/dev/sd*", "/dev/sata*"]"""
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1]
        return [m.group(1) for m in re.finditer(r'"([^"]*)"', inner)]
    return []


def parse_agent_toml(path):
    """Parse agent.toml into a JSON-serialisable dict.

    Uses tomllib when available (Python 3.11+), otherwise falls back to a
    hand-written parser for the known schema.
    """
    with open(path, "r") as f:
        content = f.read()

    try:
        try:
            import tomllib  # Python 3.11+
        except ImportError:
            import tomli as tomllib  # optional: pip install tomli

        raw = tomllib.loads(content)
        agent_raw = raw.get("agent", {})
        lsi_raw = raw.get("lsi_hba", {})
        smartctl_raw = raw.get("smartctl", {})
        sensors_raw = raw.get("persistent_sensor", [])

        config = {
            "agent": {
                "virtio_port": agent_raw.get("virtio_port", "/dev/virtio-ports/org.vfio_sensor_bridge.0"),
                "scan_root": agent_raw.get("scan_root", "/sys/class/hwmon"),
                "hwmon_name_template": agent_raw.get("hwmon_name_template", "Synology"),
                "rescan_seconds": int(agent_raw.get("rescan_seconds", 10)),
                "sample_seconds": int(agent_raw.get("sample_seconds", 1)),
                "heartbeat_seconds": int(agent_raw.get("heartbeat_seconds", 5)),
            },
            "lsi_hba": {
                "enabled": bool(lsi_raw.get("enabled", False)),
                "devices": list(lsi_raw.get("devices", ["/dev/mpt2ctl", "/dev/mpt3ctl"])),
                "max_ioc": int(lsi_raw.get("max_ioc", 16)),
                "label_template": str(lsi_raw.get("label_template", "{chip}")),
            },
            "smartctl": {
                "enabled": bool(smartctl_raw.get("enabled", False)),
                "command": str(smartctl_raw.get("command", "/usr/sbin/smartctl")),
                "device_globs": list(smartctl_raw.get("device_globs", ["/dev/sd*", "/dev/sata*"])),
                "timeout_seconds": int(smartctl_raw.get("timeout_seconds", 10)),
                "poll_seconds": int(smartctl_raw.get("poll_seconds", 30)),
                "label_template": str(smartctl_raw.get("label_template", "{device} temperature")),
            },
            "persistent_sensors": [
                {
                    "id": str(s.get("id", "")),
                    "kind": str(s.get("kind", "temperature")),
                    "label": str(s.get("label", "")),
                    "default_value": int(s.get("default_value", 0)),
                    "source": dict(s.get("source", {})),
                }
                for s in sensors_raw
            ],
        }
        return config

    except (ImportError, ModuleNotFoundError):
        pass

    # ── Fallback: hand-written parser ────────────────────────────────────────
    config = {
        "agent": {
            "virtio_port": "/dev/virtio-ports/org.vfio_sensor_bridge.0",
            "scan_root": "/sys/class/hwmon",
            "hwmon_name_template": "Synology",
            "rescan_seconds": 10,
            "sample_seconds": 1,
            "heartbeat_seconds": 5,
        },
        "lsi_hba": {
            "enabled": False,
            "devices": ["/dev/mpt2ctl", "/dev/mpt3ctl"],
            "max_ioc": 16,
            "label_template": "{chip}",
        },
        "smartctl": {
            "enabled": False,
            "command": "/usr/sbin/smartctl",
            "device_globs": ["/dev/sd*", "/dev/sata*"],
            "timeout_seconds": 10,
            "poll_seconds": 30,
            "label_template": "{device} temperature",
        },
        "persistent_sensors": [],
    }

    section = None
    sensor = None
    in_sensor_source = False

    for raw_line in content.splitlines():
        line = raw_line.strip()

        # Detect section headers
        if line == "[[persistent_sensor]]":
            if sensor is not None:
                config["persistent_sensors"].append(sensor)
            sensor = {"id": "", "kind": "temperature", "label": "", "default_value": 0, "source": {}}
            in_sensor_source = False
            section = "persistent_sensor"
            continue
        if line == "[persistent_sensor.source]":
            in_sensor_source = True
            continue
        m = re.match(r"^\[([a-z_]+)\]$", line)
        if m:
            if sensor is not None:
                config["persistent_sensors"].append(sensor)
                sensor = None
            section = m.group(1)
            in_sensor_source = False
            continue

        if not line or line.startswith("#"):
            continue

        # Parse key = value
        kv = re.match(r'^([a-z_]+)\s*=\s*(.+)$', line)
        if not kv:
            continue
        key, raw_val = kv.group(1), kv.group(2).strip()

        def parse_val(v):
            if v == "true":
                return True
            if v == "false":
                return False
            if v.startswith('"') and v.endswith('"'):
                return v[1:-1]
            if v.startswith("["):
                return _parse_string_list(v)
            try:
                return int(v)
            except ValueError:
                pass
            try:
                return float(v)
            except ValueError:
                pass
            return v

        parsed = parse_val(raw_val)

        if section == "persistent_sensor" and sensor is not None:
            if in_sensor_source:
                sensor["source"][key] = parsed
            else:
                sensor[key] = parsed
        elif section and section in config and isinstance(config[section], dict):
            config[section][key] = parsed

    if sensor is not None:
        config["persistent_sensors"].append(sensor)

    return config


if __name__ == "__main__":
    print("Content-type: application/json\n")

    if not auth.check():
        sys.exit(0)

    config_path = os.path.join(PKG_VAR, "agent.toml")
    if not os.path.exists(config_path):
        defaults = os.path.join(PKG_DEST, "etc.defaults", "agent.toml")
        if os.path.exists(defaults):
            config_path = defaults

    # Raw mode: return the TOML file as plain text.
    query_string = os.environ.get("QUERY_STRING", "")
    if "raw=1" in query_string.split("&") or query_string == "raw=1":
        try:
            with open(config_path, "r", encoding="utf-8", errors="replace") as f:
                raw = f.read()
            print(json.dumps({"success": True, "raw_content": raw}))
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(0)

    try:
        config = parse_agent_toml(config_path)
        print(json.dumps({"success": True, "config": config}, indent=2))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, indent=2))
