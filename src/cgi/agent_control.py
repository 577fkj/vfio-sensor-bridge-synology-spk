#!/usr/bin/env python3

import errno
import os
import shutil
import stat
import subprocess
import time
from pathlib import Path

PKG_NAME = "vfio-sensor-bridge"
PKG_VAR = f"/var/packages/{PKG_NAME}/var"
PKG_DEST = f"/var/packages/{PKG_NAME}/target"
LOG_FILE = os.path.join(PKG_VAR, f"{PKG_NAME}.log")
AGENT_PID = os.path.join(PKG_VAR, "agent.pid")
AUTOSTART_FLAG = os.path.join(PKG_VAR, "autostart")
AGENT_BIN = os.path.join(PKG_DEST, "bin", "vsb-agent-linux")
AGENT_CONFIG = os.path.join(PKG_VAR, "agent.toml")
AGENT_DEFAULT_CONFIG = os.path.join(PKG_DEST, "etc.defaults", "agent.toml")
AGENT_RUNNER = os.path.join(PKG_DEST, "bin", "agent-runner.sh")
SPM_EXEC = "/usr/local/bin/spm-exec"


def _now():
    return time.strftime("%Y-%m-%d %H:%M:%S")


def write_log(message):
    os.makedirs(PKG_VAR, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8", errors="replace") as f:
        f.write(f"[{_now()}] {message}\n")


def log_tail(n=120):
    try:
        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:])
    except Exception:
        return ""


def ensure_config():
    os.makedirs(PKG_VAR, exist_ok=True)
    if not os.path.exists(AGENT_CONFIG) and os.path.exists(AGENT_DEFAULT_CONFIG):
        shutil.copyfile(AGENT_DEFAULT_CONFIG, AGENT_CONFIG)


def get_autostart():
    return os.path.exists(AUTOSTART_FLAG)


def set_autostart(enabled):
    if enabled:
        os.makedirs(PKG_VAR, exist_ok=True)
        with open(AUTOSTART_FLAG, "w", encoding="utf-8") as f:
            f.write("")
    else:
        try:
            os.remove(AUTOSTART_FLAG)
        except FileNotFoundError:
            pass


def read_agent_pid():
    try:
        with open(AGENT_PID, "r", encoding="utf-8") as f:
            return int(f.read().strip().split()[0])
    except Exception:
        return None


def pid_running(pid):
    if not pid or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError as e:
        return e.errno == errno.EPERM


def find_running_agent_pid():
    """Scan /proc for a running agent process (fallback when PID file is missing)."""
    try:
        for entry in os.scandir("/proc"):
            if not entry.is_dir() or not entry.name.isdigit():
                continue
            try:
                with open(f"/proc/{entry.name}/cmdline", "rb") as f:
                    cmdline = f.read().replace(b"\x00", b" ").decode(errors="replace")
                if AGENT_BIN in cmdline and "run" in cmdline:
                    return int(entry.name)
            except Exception:
                continue
    except Exception:
        pass
    return None


def cleanup_stale_pid():
    pid = read_agent_pid()
    if pid and pid_running(pid):
        return pid
    # PID file stale or missing — scan /proc as a fallback.
    # This recovers the case where auto-start (running as a non-root service
    # user) deleted the PID file after failing to start a second agent instance
    # whose virtio port was already held by a root-owned agent process.
    found_pid = find_running_agent_pid()
    if found_pid:
        try:
            os.makedirs(PKG_VAR, exist_ok=True)
            with open(AGENT_PID, "w", encoding="utf-8") as f:
                f.write(str(found_pid))
        except Exception:
            pass
        return found_pid
    try:
        os.remove(AGENT_PID)
    except FileNotFoundError:
        pass
    except Exception as e:
        write_log(f"WARNING: failed to remove stale pid file {AGENT_PID}: {e}")
    return None


def configured_virtio_port():
    try:
        with open(AGENT_CONFIG, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if line.startswith("virtio_port"):
                    return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        pass
    return "/dev/virtio-ports/org.vfio_sensor_bridge.0"


def spm_status():
    if not os.path.exists(SPM_EXEC):
        return False, f"{SPM_EXEC} not found"
    if not os.access(SPM_EXEC, os.X_OK):
        return False, f"{SPM_EXEC} is not executable"

    try:
        owner = Path(SPM_EXEC).owner()
        file_stat = os.stat(SPM_EXEC)
        mode = stat.S_IMODE(file_stat.st_mode)
        if owner != "root":
            return False, f"{SPM_EXEC} owner is {owner}, expected root"
        if not (stat.S_ISUID & mode):
            return False, f"{SPM_EXEC} setuid bit is missing"
        if not (stat.S_IXUSR & mode):
            return False, f"{SPM_EXEC} owner execute bit is missing"

        desire = "vfio-sensor-bridge-ok"
        result = subprocess.run(
            [SPM_EXEC, "echo", desire],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
            check=False,
        )
        output = (
            result.stdout.decode(errors="replace")
            + result.stderr.decode(errors="replace")
        )
        if result.returncode != 0 or desire not in output:
            return False, output.strip() or f"{SPM_EXEC} functional check failed"
        return True, "ready"
    except Exception as e:
        return False, str(e)


def agent_status():
    pid = cleanup_stale_pid()
    return {
        "running": bool(pid),
        "pid": pid,
        "pid_file": AGENT_PID,
        "log_file": LOG_FILE,
    }


def package_service_pid():
    pid_file = os.path.join(PKG_VAR, f"{PKG_NAME}.pid")
    try:
        with open(pid_file, "r", encoding="utf-8") as f:
            pid = int(f.read().strip().split()[0])
        return pid if pid_running(pid) else None
    except Exception:
        return None


def start_agent():
    ensure_config()
    pid = cleanup_stale_pid()
    if pid:
        write_log(f"start requested while agent is already running, pid={pid}")
        return {"success": True, "output": f"Agent is already running, pid={pid}"}

    ready, spm_msg = spm_status()
    if not ready:
        write_log(f"ERROR: cannot start agent: {spm_msg}")
        return {"success": False, "error": spm_msg, "log_tail": log_tail()}

    if not os.path.exists(AGENT_BIN):
        msg = f"{AGENT_BIN} not found"
        write_log(f"ERROR: cannot start agent: {msg}")
        return {"success": False, "error": msg, "log_tail": log_tail()}
    if not os.access(AGENT_BIN, os.X_OK):
        msg = f"{AGENT_BIN} is not executable"
        write_log(f"ERROR: cannot start agent: {msg}")
        return {"success": False, "error": msg, "log_tail": log_tail()}
    if not os.path.exists(AGENT_RUNNER):
        msg = f"{AGENT_RUNNER} not found"
        write_log(f"ERROR: cannot start agent: {msg}")
        return {"success": False, "error": msg, "log_tail": log_tail()}

    port = configured_virtio_port()
    if not os.path.exists(port):
        write_log(f"WARNING: configured virtio port is missing: {port}")

    write_log(f"start requested for agent, virtio_port={port}")
    log_fd = open(LOG_FILE, "ab")
    try:
        proc = subprocess.Popen(
            [AGENT_RUNNER],
            stdin=subprocess.DEVNULL,
            stdout=log_fd,
            stderr=subprocess.STDOUT,
            cwd=PKG_VAR,
            close_fds=True,
            start_new_session=True,
            env={
                **os.environ,
                "SYNOPKG_PKGNAME": PKG_NAME,
                "SYNOPKG_PKGVAR": PKG_VAR,
                "SYNOPKG_PKGDEST": PKG_DEST,
            },
        )
    except Exception as e:
        log_fd.close()
        write_log(f"ERROR: failed to launch agent runner: {e}")
        return {"success": False, "error": str(e), "log_tail": log_tail()}
    finally:
        log_fd.close()

    for _ in range(25):
        time.sleep(0.2)
        pid = read_agent_pid()
        if pid and pid_running(pid):
            return {"success": True, "output": f"Agent started, pid={pid}"}
        rc = proc.poll()
        if rc is not None:
            write_log(f"ERROR: agent runner exited early with code {rc}")
            return {
                "success": False,
                "error": f"Agent exited during startup, code={rc}",
                "log_tail": log_tail(),
            }

    return {
        "success": True,
        "output": "Agent start requested; status is still pending.",
        "log_tail": log_tail(),
    }


def _run_spm_kill(sig_name, pid):
    result = subprocess.run(
        [SPM_EXEC, "/bin/kill", sig_name, str(pid)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10,
        check=False,
    )
    output = (
        result.stdout.decode(errors="replace")
        + result.stderr.decode(errors="replace")
    )
    write_log(f"kill {sig_name} pid={pid} rc={result.returncode} output={output.strip()}")
    return result.returncode == 0, output.strip()


def stop_agent():
    pid = cleanup_stale_pid()
    if not pid:
        write_log("stop requested while agent is already stopped.")
        return {"success": True, "output": "Agent is already stopped."}

    ready, spm_msg = spm_status()
    if not ready:
        write_log(f"ERROR: cannot stop agent: {spm_msg}")
        return {"success": False, "error": spm_msg, "log_tail": log_tail()}

    write_log(f"stop requested for agent, pid={pid}")
    ok, output = _run_spm_kill("-TERM", pid)
    if not ok:
        return {"success": False, "error": output, "log_tail": log_tail()}

    for _ in range(25):
        time.sleep(0.2)
        if not pid_running(pid):
            cleanup_stale_pid()
            return {"success": True, "output": "Agent stopped."}

    write_log(f"WARNING: agent pid={pid} did not exit after SIGTERM; sending SIGKILL")
    _run_spm_kill("-KILL", pid)
    time.sleep(0.5)
    cleanup_stale_pid()
    if pid_running(pid):
        return {
            "success": False,
            "error": f"Agent pid={pid} is still running after SIGKILL",
            "log_tail": log_tail(),
        }
    return {"success": True, "output": "Agent stopped with SIGKILL."}


def restart_agent():
    write_log("restart requested for agent.")
    stop_result = stop_agent()
    if not stop_result.get("success"):
        return stop_result
    return start_agent()
