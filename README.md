# vfio-sensor-bridge-synology-spk

Synology DSM SPK package for the `vfio-sensor-bridge` Linux guest agent.

The package runs the agent inside a Synology VM and publishes hardware sensor
readings to a Proxmox VE host through a virtio-serial channel. The PVE side of
`vfio-sensor-bridge` can then expose those readings as standard Linux hwmon
devices for tools such as `sensors`, fan-control software, and PVE monitoring.

## What is included

- DSM desktop application for configuration and status.
- CGI endpoints for reading and saving agent settings.
- Package service scripts for DSM service lifecycle.
- Default `agent.toml` configuration.
- spksrc package recipe and cross-compile recipe for `agent-linux`.
- `vfio-sensor-bridge` upstream source as a Git submodule.

## Repository layout

| Path | Purpose |
| --- | --- |
| `Makefile` | spksrc package definition |
| `src/` | DSM package files, UI, CGI scripts, service scripts, defaults |
| `cross/agent-linux/` | spksrc cross-compile recipe for the guest agent |
| `cross/vfio-sensor-bridge/` | upstream `vfio-sensor-bridge` submodule |
| `scripts/setup-spksrc.sh` | prepares the package inside an existing spksrc tree |
| `scripts/wsl-spksrc-build.sh` | builds from WSL using the bundled spksrc snapshot |
| `doc/` | bundled build support files |

## Build

Initialize the submodule:

```sh
git submodule update --init
```

Build inside an existing spksrc checkout:

```sh
cd /path/to/spksrc/spk/vfio-sensor-bridge
./scripts/setup-spksrc.sh
make arch-x64-7.2
```

Build from WSL with the helper script:

```sh
./scripts/wsl-spksrc-build.sh arch-x64-7.2
```

The default target is `arch-x64-7.2`.

## Runtime configuration

The package stores the agent configuration under the DSM package target and
ships defaults from:

```text
src/etc.defaults/agent.toml
```

The DSM application provides status, start/stop controls, device discovery, and
configuration editing.

## Upstream project

The agent source and protocol documentation live in:

```text
cross/vfio-sensor-bridge/
```

Upstream repository:

```text
https://github.com/577fkj/vfio-sensor-bridge
```

## License

GPL-3.0-only
