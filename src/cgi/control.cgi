#!/usr/bin/env python3
"""POST /cgi/control.cgi — start / stop / restart the agent.

Request body: {"action": "start"|"stop"|"restart"}
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import auth
import agent_control

ALLOWED_ACTIONS = {"start", "stop", "restart", "enable_autostart", "disable_autostart"}


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

    action = payload.get("action", "")
    if action not in ALLOWED_ACTIONS:
        print(json.dumps({"success": False, "error": f"Unknown action: {action}"}))
        sys.exit(0)

    try:
        if action == "start":
            result = agent_control.start_agent()
        elif action == "stop":
            result = agent_control.stop_agent()
        elif action == "enable_autostart":
            agent_control.set_autostart(True)
            result = {"success": True}
        elif action == "disable_autostart":
            agent_control.set_autostart(False)
            result = {"success": True}
        else:
            result = agent_control.restart_agent()
        print(json.dumps(result))
    except Exception as e:
        agent_control.write_log(f"ERROR: control action {action} failed: {e}")
        print(json.dumps({"success": False, "error": str(e)}))
