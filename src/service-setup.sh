#!/bin/sh
# service-setup.sh — sourced by spksrc installer and start-stop-status scripts.
# Follows the pattern of synology-dsm-open-vm-tools/src/service-setup.sh.

if [ -z "${SYNOPKG_PKGNAME}" ] || [ -z "${SYNOPKG_DSM_VERSION_MAJOR}" ]; then
    echo "Error: Environment variables not set. Run via synopkg." 1>&2
    exit 1
fi

# ── Package identity ──────────────────────────────────────────────────────────
PKG_NAME="vfio-sensor-bridge"
USER="sc-${PKG_NAME}"
EFF_USER="sc-${PKG_NAME}"

LOG_FILE="${SYNOPKG_PKGVAR}/${PKG_NAME}.log"
PID_FILE="${SYNOPKG_PKGVAR}/${PKG_NAME}.pid"

PACKAGE_SERVICE="${SYNOPKG_PKGDEST}/bin/package-service.sh"
AGENT_CONFIG="${SYNOPKG_PKGVAR}/agent.toml"
AGENT_PID="${SYNOPKG_PKGVAR}/agent.pid"
RUNNER_PID="${SYNOPKG_PKGVAR}/runner.pid"
SPM_EXEC="/usr/local/bin/spm-exec"

# ── Service command ───────────────────────────────────────────────────────────
# Keep the package service started so DSM keeps the settings UI accessible.
# The agent process itself is started and stopped from the settings page.
SERVICE_COMMAND="${PACKAGE_SERVICE}"
SVC_BACKGROUND=y
SVC_WRITE_PID=y
SVC_CWD="${SYNOPKG_PKGVAR}"

# ── Installation hooks ────────────────────────────────────────────────────────
_kill_agent() {
    # Kill agent-runner.sh first to prevent it from restarting the agent
    if [ -r "${RUNNER_PID}" ]; then
        _rpid="$(cat "${RUNNER_PID}" 2>/dev/null | awk '{print $1}')"
        if [ -n "${_rpid}" ] && [ -d "/proc/${_rpid}" ]; then
            echo "Stopping agent-runner pid ${_rpid}." >> "${LOG_FILE}"
            kill -9 "${_rpid}" 2>/dev/null || true
        fi
        rm -f "${RUNNER_PID}"
    fi

    if [ -r "${AGENT_PID}" ]; then
        _pid="$(cat "${AGENT_PID}" 2>/dev/null | awk '{print $1}')"
        if [ -n "${_pid}" ] && [ -d "/proc/${_pid}" ]; then
            echo "Stopping agent pid ${_pid}." >> "${LOG_FILE}"
            "${SPM_EXEC}" /bin/kill -9 "${_pid}" >> "${LOG_FILE}" 2>&1 || true
            # Wait up to 5 s for the process to exit
            _waited=0
            while [ -d "/proc/${_pid}" ] && [ "${_waited}" -lt 5 ]; do
                sleep 1
                _waited=$((_waited + 1))
            done
            # Force-kill if still running
            if [ -d "/proc/${_pid}" ]; then
                echo "Agent did not stop; sending SIGKILL." >> "${LOG_FILE}"
                "${SPM_EXEC}" /bin/kill -KILL "${_pid}" >> "${LOG_FILE}" 2>&1 || true
            fi
        fi
        rm -f "${AGENT_PID}"
    fi

    "${SPM_EXEC}" pkill -9 "agent-runner.sh" 2>/dev/null || true
    "${SPM_EXEC}" pkill -9 "vsb-agent-linux" 2>/dev/null || true
    "${SPM_EXEC}" pkill -9 "agent-linux" 2>/dev/null || true   # compat: kill pre-rename binary on upgrade
    sleep 1
    "${SPM_EXEC}" pkill -9 "vsb-agent-linux" 2>/dev/null || true
    "${SPM_EXEC}" pkill -9 "agent-linux" 2>/dev/null || true
}

service_postinst() {
    mkdir -p "${SYNOPKG_PKGVAR}"

    # Copy default config on first install
    if [ ! -f "${AGENT_CONFIG}" ]; then
        cp -f "${SYNOPKG_PKGDEST}/etc.defaults/agent.toml" "${AGENT_CONFIG}"
    fi

    # Apply wizard-collected virtio_port (wizard key: wizard_virtio_port)
    if [ -n "${wizard_virtio_port}" ]; then
        sed -i "s|^virtio_port = .*|virtio_port = \"${wizard_virtio_port}\"|" "${AGENT_CONFIG}"
    fi

    echo "VFIO Sensor Bridge installed. Start and stop the agent from the package settings page." >> "${LOG_FILE}"
}

service_preuninst() {
    _kill_agent
}

service_postuninst() {
    return 0
}

service_preupgrade() {
    _kill_agent
}

service_postupgrade() {
    # Preserve existing config across upgrades
    return 0
}

# ── Runtime hooks ─────────────────────────────────────────────────────────────
service_prestart() {
    # Ensure config file exists
    mkdir -p "${SYNOPKG_PKGVAR}"
    if [ ! -f "${AGENT_CONFIG}" ]; then
        cp -f "${SYNOPKG_PKGDEST}/etc.defaults/agent.toml" "${AGENT_CONFIG}"
    fi
}

service_poststop() {
    _kill_agent
}
