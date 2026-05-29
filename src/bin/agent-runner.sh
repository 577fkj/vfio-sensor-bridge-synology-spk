#!/bin/sh

PKG_NAME="vfio-sensor-bridge"
PKG_VAR="${SYNOPKG_PKGVAR:-/var/packages/${PKG_NAME}/var}"
PKG_DEST="${SYNOPKG_PKGDEST:-/var/packages/${PKG_NAME}/target}"
LOG_FILE="${PKG_VAR}/${PKG_NAME}.log"
AGENT_PID="${PKG_VAR}/agent.pid"
AGENT_BIN="${PKG_DEST}/bin/vsb-agent-linux"
AGENT_CONFIG="${PKG_VAR}/agent.toml"
SPM_EXEC="/usr/local/bin/spm-exec"

ts() {
    date "+%Y-%m-%d %H:%M:%S"
}

mkdir -p "${PKG_VAR}"

{
    echo "[$(ts)] agent runner starting."
    echo "[$(ts)] command: ${SPM_EXEC} -pid ${AGENT_PID} ${AGENT_BIN} run --config ${AGENT_CONFIG}"

    if [ ! -x "${SPM_EXEC}" ]; then
        echo "[$(ts)] ERROR: ${SPM_EXEC} is missing or not executable."
        exit 127
    fi

    if [ ! -x "${AGENT_BIN}" ]; then
        echo "[$(ts)] ERROR: ${AGENT_BIN} is missing or not executable."
        exit 127
    fi

    if [ ! -f "${AGENT_CONFIG}" ]; then
        echo "[$(ts)] ERROR: ${AGENT_CONFIG} does not exist."
        exit 2
    fi

    "${SPM_EXEC}" -pid "${AGENT_PID}" "${AGENT_BIN}" run --config "${AGENT_CONFIG}"
    rc=$?
    echo "[$(ts)] agent exited with code ${rc}."
    rm -f "${AGENT_PID}"
    exit "${rc}"
} >> "${LOG_FILE}" 2>&1
