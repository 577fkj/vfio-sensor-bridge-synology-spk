#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-arch-x64-7.2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORK="$(mktemp -d "${HOME}/vsb-spksrc-build.XXXXXX")"
BUILD_ROOT="${WORK}/spksrc"
PKG_ROOT="${BUILD_ROOT}/spk/vfio-sensor-bridge"
TOOLS_DIR="${WORK}/bin"

echo "BUILD_ROOT=${BUILD_ROOT}"
echo "PKG_ROOT=${PKG_ROOT}"
echo "TARGET=${TARGET}"

mkdir -p "${TOOLS_DIR}"
cat > "${TOOLS_DIR}/sponge" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp "${TMPDIR:-/tmp}/sponge.XXXXXX")"
cat > "${tmp}"
if [ "$#" -eq 0 ]; then
    cat "${tmp}"
else
    cat "${tmp}" > "$1"
fi
rm -f "${tmp}"
EOF
chmod +x "${TOOLS_DIR}/sponge"

if ! command -v convert >/dev/null 2>&1; then
cat > "${TOOLS_DIR}/convert" <<'EOF'
#!/usr/bin/env python3
import sys
from pathlib import Path
from PIL import Image

args = sys.argv[1:]
if len(args) < 2:
    raise SystemExit("usage: convert INPUT [OPTIONS] OUTPUT")

src = args[0]
dst = args[-1]
mode = None
size = None
i = 1
while i < len(args) - 1:
    opt = args[i]
    if opt in ("-thumbnail", "-resize") and i + 1 < len(args) - 1:
        mode = opt
        size = args[i + 1]
        i += 2
    elif opt == "-strip":
        i += 1
    elif opt == "-sharpen" and i + 1 < len(args) - 1:
        i += 2
    else:
        i += 1

img = Image.open(src).convert("RGBA")
if size:
    width_text, height_text = size.lower().split("x", 1)
    width = int(width_text)
    height = int(height_text)
    if mode == "-thumbnail":
        img.thumbnail((width, height), Image.Resampling.LANCZOS)
    else:
        img = img.resize((width, height), Image.Resampling.LANCZOS)

if dst == "-":
    img.save(sys.stdout.buffer, format="PNG")
else:
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, format="PNG")
EOF
chmod +x "${TOOLS_DIR}/convert"
fi
export PATH="${TOOLS_DIR}:${PATH}"
export RUSTUP_DIST_SERVER="${RUSTUP_DIST_SERVER:-https://rsproxy.cn}"
export RUSTUP_UPDATE_ROOT="${RUSTUP_UPDATE_ROOT:-https://rsproxy.cn/rustup}"

cd "${SRC}/doc"
tar \
    --exclude="./spksrc/spk/vfio-sensor-bridge" \
    --exclude="spksrc/spk/vfio-sensor-bridge" \
    -cf - spksrc | tar -C "${WORK}" -xf -
{
    printf 'SHELL := /bin/bash\n'
    printf 'TC_DIST_SITE_URL = https://cndl.synology.cn/download/ToolChain/toolchain/$(TC_VERS)-$(TC_BUILD)\n'
} > "${BUILD_ROOT}/local.mk"
find "${BUILD_ROOT}" -type f \
    \( -name Makefile -o -name digests -o -name "*.mk" -o -name "*.sh" -o -name PLIST -o -name "*.yml" -o -name "*.yaml" \) \
    -exec sed -i 's/\r$//' {} +

rm -rf "${PKG_ROOT}"
mkdir -p "${PKG_ROOT}"
cd "${SRC}"
tar \
    --exclude="./.git" \
    --exclude="./doc" \
    --exclude="./wsl-list.raw" \
    -cf - . | tar -C "${PKG_ROOT}" -xf -
find "${PKG_ROOT}" -type f \
    \( -name Makefile -o -name digests -o -name "*.mk" -o -name "*.sh" -o -name PLIST -o -name "*.yml" -o -name "*.yaml" \) \
    -exec sed -i 's/\r$//' {} +

cd "${PKG_ROOT}"
bash scripts/setup-spksrc.sh

make "${TARGET}"
