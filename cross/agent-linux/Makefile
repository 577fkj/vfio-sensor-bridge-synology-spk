PKG_NAME = agent-linux
PKG_VERS = 0.1.0
PKG_EXT = tar.gz
PKG_DIST_NAME = $(PKG_NAME)-$(PKG_VERS).$(PKG_EXT)
PKG_DIR = $(PKG_NAME)-$(PKG_VERS)

# Source is bundled in the spk package repository.
# This recipe creates a local tarball so spksrc can use its normal extract,
# install, and PLIST tracking pipeline.
#
# Run ./scripts/setup-spksrc.sh once to copy the recipe into
# spksrc/cross/agent-linux, then:
#   git submodule update --init
#   make arch-x64-7.2

PRE_DOWNLOAD_TARGET = agent_linux_create_tarball
CHECKSUM_TARGET = nop

RUST_SRC_DIR = $(WORK_DIR)/$(PKG_DIR)/agent-linux
CARGO_BUILD_ARGS = --locked

POST_INSTALL_TARGET = agent_linux_rename_binary

# x86_64 only — Synology NAS running as a KVM VM on Proxmox VE
UNSUPPORTED_ARCHS = $(ARMv5_ARCHS) $(PPC_ARCHS) $(i686_ARCHS) $(ARMv7L_ARCHS) $(ARMv7_ARCHS)

HOMEPAGE = https://github.com/577fkj/vfio-sensor-bridge
LICENSE  = GPL-3.0

include ../../mk/spksrc.cross-rust.mk

.PHONY: agent_linux_create_tarball agent_linux_rename_binary

agent_linux_rename_binary:
	@$(MSG) Renaming agent-linux binary to vsb-agent-linux
	@mv -f "$(STAGING_INSTALL_PREFIX)/bin/agent-linux" "$(STAGING_INSTALL_PREFIX)/bin/vsb-agent-linux"
agent_linux_create_tarball:
	@$(MSG) Creating source tarball for agent-linux
	@mkdir -p $(DISTRIB_DIR)
	@rm -f "$(DISTRIB_DIR)/$(PKG_DIST_NAME)"
	@src="$(CURDIR)/../../spk/vfio-sensor-bridge/cross/vfio-sensor-bridge" ; \
	tmp="$$(mktemp -d)" ; \
	cp -a "$${src}" "$${tmp}/$(PKG_DIR)" ; \
	rm -rf "$${tmp}/$(PKG_DIR)/target" ; \
	(cd "$${tmp}" && tar czf "$(DISTRIB_DIR)/$(PKG_DIST_NAME)" "$(PKG_DIR)") ; \
	rm -rf "$${tmp}"
