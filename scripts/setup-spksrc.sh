#!/usr/bin/env bash
# setup-spksrc.sh — prepare a spksrc tree to build vfio-sensor-bridge.
#
# This project (the SPK package) lives at:
#   <spksrc>/spk/vfio-sensor-bridge/        ← run this script from here
#
# spksrc expects cross-compile recipes at <spksrc>/cross/<name>/.
# This script copies the required recipe so spksrc can find the
# agent-linux recipe bundled inside this repository:
#
#   <spksrc>/cross/agent-linux
#
# Usage:
#   cd /path/to/spksrc/spk/vfio-sensor-bridge
#   git submodule update --init
#   ./scripts/setup-spksrc.sh
#   make arch-x64-7.2

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SPKSRC_ROOT="$(cd "${PROJECT_ROOT}/../.." && pwd)"

echo "Project root : ${PROJECT_ROOT}"
echo "spksrc root  : ${SPKSRC_ROOT}"

CROSS_DEST="${SPKSRC_ROOT}/cross/agent-linux"
CROSS_SRC="${PROJECT_ROOT}/cross/agent-linux"

if [[ ! -d "${CROSS_SRC}" ]]; then
    echo "ERROR: cross/agent-linux not found at ${CROSS_SRC}" >&2
    exit 1
fi

if [[ -L "${CROSS_DEST}" ]]; then
    echo "Removing old symlink: ${CROSS_DEST} → $(readlink "${CROSS_DEST}")"
    rm "${CROSS_DEST}"
fi

if [[ -e "${CROSS_DEST}" ]]; then
    if [[ -L "${CROSS_DEST}" ]]; then
        echo "Symlink already exists: ${CROSS_DEST} → $(readlink "${CROSS_DEST}")"
    elif [[ -d "${CROSS_DEST}" ]]; then
        cp -a "${CROSS_SRC}/." "${CROSS_DEST}/"
        echo "Updated recipe: ${CROSS_SRC} → ${CROSS_DEST}"
    else
        echo "ERROR: ${CROSS_DEST} already exists and is not a directory." >&2
        echo "Remove it manually if you want to replace it." >&2
        exit 1
    fi
else
    mkdir -p "${SPKSRC_ROOT}/cross"
    cp -a "${CROSS_SRC}" "${CROSS_DEST}"
    echo "Copied recipe: ${CROSS_SRC} → ${CROSS_DEST}"
fi

echo ""
echo "Setup complete. Next steps:"
echo "  git submodule update --init"
echo "  make arch-x64-7.2"
