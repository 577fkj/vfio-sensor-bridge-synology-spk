SPK_NAME    = vfio-sensor-bridge
SPK_VERS    = 0.1.0
SPK_REV     = 1
SPK_ICON    = src/vfio-sensor-bridge.png

DEPENDS = cross/agent-linux

MAINTAINER   = 577fkj
MAINTAINER_URL = https://github.com/577fkj
DISABLE_GITHUB_MAINTAINER = 1
DESCRIPTION  = Bridges VFIO pass-through VM hardware sensors (temperature/fan/voltage/power) to the Proxmox VE host via virtio-serial. The agent runs inside the Synology VM and exposes hwmon/HBA/disk sensors to the PVE hostd daemon.
RELOAD_UI    = yes
DISPLAY_NAME = VFIO Sensor Bridge Agent
CHANGELOG    = "Initial release"

HOMEPAGE = https://github.com/577fkj/vfio-sensor-bridge
LICENSE  = GPL-3.0-only

# SimplePermissionManager is required: agent-linux needs root to access
# /dev/virtio-ports/* and is launched via spm-exec.
SPK_DEPENDS = "SimplePermissionManager>=1.0.0"

SERVICE_USER  = auto
SERVICE_SETUP = src/service-setup.sh
STARTABLE     = yes
SYSTEM_GROUP  = http

# Installation wizard: collects virtio_port path
WIZARDS_DIR = src/wizard/

# DSM desktop shortcut
DSM_UI_DIR    = app
DSM_UI_CONFIG = src/app/config
DSM_APP_NAME  = VfioSensorBridge.AppInstance

# DSM 7 privilege definition
CONF_DIR = src/conf/

UNSUPPORTED_ARCHS = $(ARMv5_ARCHS) $(PPC_ARCHS) $(i686_ARCHS) $(ARMv7L_ARCHS) $(ARMv7_ARCHS)

PRE_COPY_TARGET = depend
POST_COPY_TARGET = vfio_sensor_bridge_extra_install

include ../../mk/spksrc.spk.mk

.PHONY: vfio_sensor_bridge_extra_install
vfio_sensor_bridge_extra_install:
	# CGI scripts
	install -d -m 755 $(STAGING_DIR)/cgi
	install -m 755 src/cgi/status.cgi $(STAGING_DIR)/cgi/
	install -m 755 src/cgi/get-config.cgi $(STAGING_DIR)/cgi/
	install -m 755 src/cgi/save-config.cgi $(STAGING_DIR)/cgi/
	install -m 755 src/cgi/discover-sensors.cgi $(STAGING_DIR)/cgi/
	install -m 755 src/cgi/control.cgi $(STAGING_DIR)/cgi/
	install -m 644 src/cgi/auth.py $(STAGING_DIR)/cgi/
	install -m 644 src/cgi/agent_control.py $(STAGING_DIR)/cgi/
	# Package service and agent launcher
	install -d -m 755 $(STAGING_DIR)/bin
	install -m 755 src/bin/package-service.sh $(STAGING_DIR)/bin/
	install -m 755 src/bin/agent-runner.sh $(STAGING_DIR)/bin/
	# Desktop app files
	install -d -m 755 $(STAGING_DIR)/app
	ln -sfn /var/packages/$(SPK_NAME)/target/cgi $(STAGING_DIR)/app/cgi
	cp -r src/app/VfioSensorBridge.js $(STAGING_DIR)/app/
	cp -r src/app/config $(STAGING_DIR)/app/
	cp -r src/app/helptoc.conf $(STAGING_DIR)/app/
	install -d -m 755 $(STAGING_DIR)/app/texts/enu
	install -d -m 755 $(STAGING_DIR)/app/texts/chs
	install -m 644 src/app/texts/enu/strings $(STAGING_DIR)/app/texts/enu/
	install -m 644 src/app/texts/chs/strings $(STAGING_DIR)/app/texts/chs/
	install -d -m 755 $(STAGING_DIR)/app/help/enu
	install -m 644 src/app/help/enu/VfioSensorBridge_index.html $(STAGING_DIR)/app/help/enu/
	# Default configuration
	install -d -m 755 $(STAGING_DIR)/etc.defaults
	install -m 644 src/etc.defaults/agent.toml $(STAGING_DIR)/etc.defaults/
