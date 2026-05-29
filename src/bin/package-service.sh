#!/bin/sh

PKG_NAME="vfio-sensor-bridge"
PKG_VAR="${SYNOPKG_PKGVAR:-/var/packages/${PKG_NAME}/var}"
PKG_DEST="${SYNOPKG_PKGDEST:-/var/packages/${PKG_NAME}/target}"
LOG_FILE="${PKG_VAR}/${PKG_NAME}.log"
AGENT_RUNNER="${PKG_DEST}/bin/agent-runner.sh"
AGENT_PID="${PKG_VAR}/agent.pid"
RUNNER_PID="${PKG_VAR}/runner.pid"
AUTOSTART_FLAG="${PKG_VAR}/autostart"

ts() {
    date "+%Y-%m-%d %H:%M:%S"
}

# Check if a PID corresponds to a running process.
# Uses /proc (works across user boundaries; kill -0 fails with EPERM for
# root-owned processes when called from a non-root service user).
_proc_running() {
    [ -n "$1" ] && [ -d "/proc/$1" ]
}

mkdir -p "${PKG_VAR}"
echo "[$(ts)] package service started; agent is managed from the package settings page." >> "${LOG_FILE}"

# Auto-start the agent if the flag file is present
if [ -f "${AUTOSTART_FLAG}" ]; then
    _autostart_running=0
    if [ -r "${AGENT_PID}" ]; then
        _autostart_pid="$(awk '{print $1}' "${AGENT_PID}" 2>/dev/null)"
        if _proc_running "${_autostart_pid}"; then
            _autostart_running=1
        fi
    fi
    # Fallback: check by process name in case pid file is missing or stale
    if [ "${_autostart_running}" -eq 0 ] && pgrep "vsb-agent-linux" > /dev/null 2>&1; then
        echo "[$(ts)] autostart: agent already running (detected by name), skipping start." >> "${LOG_FILE}"
        _autostart_running=1
    fi
    if [ "${_autostart_running}" -eq 0 ] && [ -x "${AGENT_RUNNER}" ]; then
        echo "[$(ts)] autostart: starting agent." >> "${LOG_FILE}"
        "${AGENT_RUNNER}" &
        _runner_pid=$!
        echo "${_runner_pid}" > "${RUNNER_PID}"
    fi
fi

stop_service() {
    echo "[$(ts)] package service stopped." >> "${LOG_FILE}"
    # Kill agent-runner.sh if tracked
    if [ -r "${RUNNER_PID}" ]; then
        _rpid="$(cat "${RUNNER_PID}" 2>/dev/null)"
        if [ -n "${_rpid}" ] && kill -0 "${_rpid}" 2>/dev/null; then
            kill -TERM "${_rpid}" 2>/dev/null || true
        fi
        rm -f "${RUNNER_PID}"
    fi
    # Kill the background sleep so the while-loop wakes up and exits cleanly
    kill "${_sleep_pid}" 2>/dev/null || true
    exit 0
}

trap stop_service TERM INT

while true; do
    sleep 3600 &
    _sleep_pid=$!
    wait "${_sleep_pid}"
done
