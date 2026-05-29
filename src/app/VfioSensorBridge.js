// VFIO Sensor Bridge — DSM 7 package GUI
// Pattern: doc/SimplePermissionManager/src/app/SimplePermissionManager.js

Ext.ns("VfioSensorBridge");

// ── Translator shortcut ──────────────────────────────────────────────────────
_V = function (category, element) {
    return _TT("VfioSensorBridge.AppInstance", category, element);
};

var CGI_BASE = "/webman/3rdparty/vfio-sensor-bridge/cgi/";

// ── AppInstance ──────────────────────────────────────────────────────────────
Ext.define("VfioSensorBridge.AppInstance", {
    extend: "SYNO.SDS.AppInstance",
    appWindowName: "VfioSensorBridge.AppWindow",
    constructor: function () {
        this.callParent(arguments);
    },
});

// ── AppWindow ────────────────────────────────────────────────────────────────
Ext.define("VfioSensorBridge.AppWindow", {
    extend: "SYNO.SDS.AppWindow",
    appInstance: null,

    // Cached config from last load
    _statusData: null,
    _configData: null,

    // GridPanel store for persistent sensors
    _sensorStore: null,

    _cmpPrefix: null,

    _cmpId: function (name) {
        return this._cmpPrefix + name;
    },

    _cmp: function (name) {
        return Ext.getCmp(this._cmpId(name));
    },

    onOpen: function (a) {
        VfioSensorBridge.AppWindow.superclass.onOpen.call(this, a);
        this._loadAll();
    },

    constructor: function (config) {
        this.appInstance = config.appInstance;
        this._cmpPrefix = Ext.id(null, "vsb_app_") + "_";

        // Build sensor store
        this._sensorStore = new Ext.data.ArrayStore({
            fields: ["id", "kind", "label", "default_value",
                     "src_type", "src_chip", "src_input", "src_label", "src_devpath",
                     "src_device", "src_ioc"]
        });

        var tabs = [
            { title: _V("tab", "status"),        layout: "form", autoScroll: true, items: this._createStatusTab() },
            { title: _V("tab", "agent"),         layout: "form", autoScroll: true, items: this._createAgentTab() },
            { title: _V("tab", "other_sensors"), layout: "form", autoScroll: true, items: [this._createHbaFieldset(), this._createSmartctlFieldset()] },
            { title: _V("tab", "sensors"),       layout: "fit",  items: [this._createSensorsGrid()] },
            { title: _V("tab", "config_editor"), layout: "fit",  items: [this._createConfigEditorTab()] },
            { title: _V("tab", "logs"),          layout: "fit",  items: [this._createLogsTab()] },
        ];

        config = Ext.apply(
            {
                resizable: true,
                maximizable: true,
                minimizable: true,
                layout: "fit",
                width: 760,
                height: 580,
                padding: "15px",
                items: [
                    {
                        xtype: "syno_tabpanel",
                        activeTab: 0,
                        plain: true,
                        items: tabs,
                        deferredRender: true,
                    },
                ],
                buttons: [
                    {
                        xtype: "syno_button",
                        btnStyle: "blue",
                        text: _V("save", "btn_save"),
                        handler: function () { this._doSave(false); }.bind(this),
                    },
                    {
                        xtype: "syno_button",
                        text: _V("save", "btn_save_restart"),
                        style: "margin-left:8px;",
                        handler: function () { this._doSave(true); }.bind(this),
                    },
                ],
            },
            config
        );

        this.callParent([config]);
    },

    // ── Data loading ─────────────────────────────────────────────────────────

    _loadAll: function () {
        Ext.Ajax.request({
            url: CGI_BASE + "status.cgi",
            method: "GET",
            timeout: 15000,
            scope: this,
            success: function (resp) {
                this._statusData = Ext.decode(resp.responseText);
                this._applyStatus();
            },
            failure: function () { /* ignore */ },
        });
        Ext.Ajax.request({
            url: CGI_BASE + "get-config.cgi",
            method: "GET",
            timeout: 15000,
            scope: this,
            success: function (resp) {
                var res = Ext.decode(resp.responseText);
                if (res.success) {
                    this._configData = res.config;
                    this._applyConfig();
                }
            },
            failure: function () { /* ignore */ },
        });
    },

    _applyStatus: function () {
        var d = this._statusData;
        if (!d) return;

        var svcCmp = this._cmp("vsb_svc_status");
        if (svcCmp) {
            if (d.agent_running) {
                svcCmp.setValue(_V("app", "status_running"));
                svcCmp.getEl() && svcCmp.getEl().setStyle("color", "green");
            } else {
                svcCmp.setValue(_V("app", "status_stopped"));
                svcCmp.getEl() && svcCmp.getEl().setStyle("color", "red");
            }
        }

        var spmCmp = this._cmp("vsb_spm_status");
        if (spmCmp) {
            if (d.spm_ready) {
                spmCmp.setValue(_V("app", "spm_active"));
                spmCmp.getEl() && spmCmp.getEl().setStyle("color", "green");
            } else {
                spmCmp.setValue(_V("app", "spm_inactive"));
                spmCmp.getEl() && spmCmp.getEl().setStyle("color", "orange");
            }
        }

        var pkgCmp = this._cmp("vsb_pkg_status");
        if (pkgCmp) {
            if (d.service_running) {
                pkgCmp.setValue(_V("app", "package_running"));
                pkgCmp.getEl() && pkgCmp.getEl().setStyle("color", "green");
            } else {
                pkgCmp.setValue(_V("app", "package_stopped"));
                pkgCmp.getEl() && pkgCmp.getEl().setStyle("color", "orange");
            }
        }

        var pidCmp = this._cmp("vsb_agent_pid");
        if (pidCmp) {
            pidCmp.setValue(d.agent_pid ? String(d.agent_pid) : "-");
        }

        var logPathCmp = this._cmp("vsb_log_file");
        if (logPathCmp) {
            logPathCmp.setValue(d.log_file || "");
        }

        var devCmp = this._cmp("vsb_virtio_status");
        if (devCmp) {
            var txt = (d.virtio_port || "") + "  —  " + (d.virtio_device_exists
                ? _V("app", "virtio_present") : _V("app", "virtio_missing"));
            devCmp.setValue(txt);
            devCmp.getEl() && devCmp.getEl().setStyle("color", d.virtio_device_exists ? "green" : "red");
        }

        var logCmp = this._cmp("vsb_log_area");
        if (logCmp && d.log_tail) {
            logCmp.setValue(d.log_tail || _V("logs", "empty"));
        }

        var autostartCmp = this._cmp("vsb_autostart");
        if (autostartCmp) {
            autostartCmp.suspendEvents();
            autostartCmp.setValue(!!d.autostart_enabled);
            autostartCmp.resumeEvents();
        }
    },

    _applyConfig: function () {
        var c = this._configData;
        if (!c) return;

        var a = c.agent || {};
        var me = this;
        var _set = function (id, val) {
            var cmp = me._cmp(id);
            if (cmp) cmp.setValue(val);
        };

        _set("vsb_virtio_port",      a.virtio_port);
        _set("vsb_scan_root",        a.scan_root);
        _set("vsb_hwmon_name_template", a.hwmon_name_template);
        _set("vsb_rescan_seconds",   a.rescan_seconds);
        _set("vsb_sample_seconds",   a.sample_seconds);
        _set("vsb_heartbeat_seconds",a.heartbeat_seconds);

        var h = c.lsi_hba || {};
        _set("vsb_hba_enabled",       h.enabled);
        _set("vsb_hba_devices",       (h.devices || []).join("\n"));
        _set("vsb_hba_max_ioc",       h.max_ioc);
        _set("vsb_hba_label",         h.label_template);

        var s = c.smartctl || {};
        _set("vsb_sctl_enabled",      s.enabled);
        _set("vsb_sctl_command",      s.command);
        _set("vsb_sctl_globs",        (s.device_globs || []).join("\n"));
        _set("vsb_sctl_timeout",      s.timeout_seconds);
        _set("vsb_sctl_poll",         s.poll_seconds);
        _set("vsb_sctl_label",        s.label_template);

        // Populate sensor grid
        this._sensorStore.removeAll();
        Ext.each(c.persistent_sensors || [], function (ps) {
            var src = ps.source || {};
            this._sensorStore.add(new this._sensorStore.recordType({
                id:          ps.id,
                kind:        ps.kind,
                label:       ps.label,
                default_value: ps.default_value,
                src_type:    src.type || "hwmon",
                src_chip:    src.chip_name || "",
                src_input:   src.input || "",
                src_label:   src.source_label || "",
                src_devpath: src.device_path_contains || "",
                src_device:  src.device || "",
                src_ioc:     src.ioc,
            }));
        }, this);
    },

    // ── Collect & save ───────────────────────────────────────────────────────

    _collectConfig: function () {
        var me = this;
        var _g = function (id) {
            var c = me._cmp(id);
            return c ? c.getValue() : undefined;
        };

        var hbaDevices = (_g("vsb_hba_devices") || "")
            .split("\n").map(function (x) { return x.trim(); }).filter(function (x) { return x; });
        var sctlGlobs = (_g("vsb_sctl_globs") || "")
            .split("\n").map(function (x) { return x.trim(); }).filter(function (x) { return x; });

        var sensors = [];
        this._sensorStore.each(function (rec) {
            sensors.push({
                id:            rec.get("id"),
                kind:          rec.get("kind"),
                label:         rec.get("label"),
                default_value: parseInt(rec.get("default_value"), 10) || 0,
                source: {
                    type:                  rec.get("src_type") || "hwmon",
                    chip_name:             rec.get("src_chip"),
                    input:                 rec.get("src_input"),
                    source_label:          rec.get("src_label"),
                    device_path_contains:  rec.get("src_devpath"),
                    device:                rec.get("src_device"),
                    ioc:                   parseInt(rec.get("src_ioc"), 10) || 0,
                },
            });
        });

        return {
            agent: {
                virtio_port:       _g("vsb_virtio_port"),
                scan_root:         _g("vsb_scan_root"),
                hwmon_name_template: _g("vsb_hwmon_name_template"),
                rescan_seconds:    parseInt(_g("vsb_rescan_seconds"), 10) || 10,
                sample_seconds:    parseInt(_g("vsb_sample_seconds"), 10) || 1,
                heartbeat_seconds: parseInt(_g("vsb_heartbeat_seconds"), 10) || 5,
            },
            lsi_hba: {
                enabled:        !!_g("vsb_hba_enabled"),
                devices:        hbaDevices,
                max_ioc:        parseInt(_g("vsb_hba_max_ioc"), 10) || 16,
                label_template: _g("vsb_hba_label"),
            },
            smartctl: {
                enabled:          !!_g("vsb_sctl_enabled"),
                command:          _g("vsb_sctl_command"),
                device_globs:     sctlGlobs,
                timeout_seconds:  parseInt(_g("vsb_sctl_timeout"), 10) || 10,
                poll_seconds:     parseInt(_g("vsb_sctl_poll"), 10) || 30,
                label_template:   _g("vsb_sctl_label"),
            },
            persistent_sensors: sensors,
        };
    },

    _doSave: function (restart) {
        var payload = {
            config:  this._collectConfig(),
            restart: !!restart,
        };
        Ext.Ajax.request({
            url: CGI_BASE + "save-config.cgi",
            method: "POST",
            jsonData: payload,
            timeout: 30000,
            scope: this,
            success: function (resp) {
                var res = Ext.decode(resp.responseText);
                if (res.success) {
                    SYNO.SDS.MessageBoxV5.alert(
                        _V("save", restart ? "saved_restart_ok" : "saved_ok")
                    );
                } else {
                    SYNO.SDS.MessageBoxV5.alert(
                        _V("save", "save_failed") + (res.error ? " " + res.error : "")
                    );
                }
            },
            failure: function () {
                SYNO.SDS.MessageBoxV5.alert(_V("save", "save_failed"));
            },
        });
    },

    // ── Tab: Status ──────────────────────────────────────────────────────────

    _createStatusTab: function () {
        var statusFieldset = new SYNO.ux.FieldSet({
            title: _V("app", "status"),
            collapsible: false,
            items: [
                { xtype: "syno_compositefield", hideLabel: true, items: [
                    { xtype: "syno_displayfield", value: _V("app", "agent_status"), width: 180 },
                    { xtype: "syno_displayfield", id: this._cmpId("vsb_svc_status"), value: _V("app", "status_unknown") },
                ]},
                { xtype: "syno_compositefield", hideLabel: true, items: [
                    { xtype: "syno_displayfield", value: _V("app", "package_status"), width: 180 },
                    { xtype: "syno_displayfield", id: this._cmpId("vsb_pkg_status"), value: _V("app", "status_unknown") },
                ]},
                { xtype: "syno_compositefield", hideLabel: true, items: [
                    { xtype: "syno_displayfield", value: _V("app", "agent_pid"), width: 180 },
                    { xtype: "syno_displayfield", id: this._cmpId("vsb_agent_pid"), value: "-" },
                ]},
                { xtype: "syno_compositefield", hideLabel: true, items: [
                    { xtype: "syno_displayfield", value: _V("app", "spm_status"), width: 180 },
                    { xtype: "syno_displayfield", id: this._cmpId("vsb_spm_status"), value: _V("app", "status_unknown") },
                ]},
                { xtype: "syno_compositefield", hideLabel: true, items: [
                    { xtype: "syno_displayfield", value: _V("app", "virtio_device"), width: 180 },
                    { xtype: "syno_displayfield", id: this._cmpId("vsb_virtio_status"), value: "—" },
                ]},
                { xtype: "syno_compositefield", hideLabel: true, items: [
                    { xtype: "syno_displayfield", value: _V("app", "log_file"), width: 180 },
                    { xtype: "syno_displayfield", id: this._cmpId("vsb_log_file"), value: "" },
                ]},
            ],
        });

        var controlFieldset = new SYNO.ux.FieldSet({
            title: _V("ctrl", "title"),
            collapsible: false,
            items: [
                { xtype: "syno_compositefield", hideLabel: true, items: [
                    { xtype: "syno_button", id: this._cmpId("vsb_btn_start"), text: _V("ctrl", "btn_start"), handler: function () {
                        this._sendControl("start");
                    }.bind(this) },
                    { xtype: "syno_button", id: this._cmpId("vsb_btn_stop"), text: _V("ctrl", "btn_stop"), style: "margin-left:8px;", handler: function () {
                        this._sendControl("stop");
                    }.bind(this) },
                    { xtype: "syno_button", id: this._cmpId("vsb_btn_restart"), text: _V("ctrl", "btn_restart"), style: "margin-left:8px;", handler: function () {
                        this._sendControl("restart");
                    }.bind(this) },
                ]},
                { xtype: "syno_compositefield", hideLabel: true, items: [
                    { xtype: "syno_displayfield", value: _V("ctrl", "last_result"), width: 180 },
                    { xtype: "syno_displayfield", id: this._cmpId("vsb_ctrl_result"), value: "-" },
                ]},
                { xtype: "syno_compositefield", hideLabel: true, items: [
                    { xtype: "syno_checkbox", id: this._cmpId("vsb_autostart"),
                      boxLabel: _V("ctrl", "autostart"), hideLabel: true,
                      listeners: {
                          check: function (cb, checked) {
                              var action = checked ? "enable_autostart" : "disable_autostart";
                              Ext.Ajax.request({
                                  url: CGI_BASE + "control.cgi",
                                  method: "POST",
                                  jsonData: { action: action },
                                  timeout: 10000,
                                  failure: function () {
                                      cb.suspendEvents();
                                      cb.setValue(!checked);
                                      cb.resumeEvents();
                                  },
                              });
                          },
                      },
                    },
                ]},
            ],
        });

        return [statusFieldset, controlFieldset];
    },

    _setControlButtonsDisabled: function (disabled) {
        Ext.each(["vsb_btn_start", "vsb_btn_stop", "vsb_btn_restart"], function (id) {
            var btn = this._cmp(id);
            if (btn) btn.setDisabled(disabled);
        }, this);
    },

    _sendControl: function (action) {
        var actionTextMap = {
            start: _V("ctrl", "btn_start"),
            stop: _V("ctrl", "btn_stop"),
            restart: _V("ctrl", "btn_restart"),
        };
        var actionText = actionTextMap[action] || action;
        var resultCmp = this._cmp("vsb_ctrl_result");

        if (resultCmp) {
            resultCmp.setValue(_V("ctrl", "action_running").replace("{action}", actionText));
        }
        this._setControlButtonsDisabled(true);

        Ext.Ajax.request({
            url: CGI_BASE + "control.cgi",
            method: "POST",
            jsonData: { action: action },
            timeout: 30000,
            scope: this,
            success: function (resp) {
                var res;
                try {
                    res = Ext.decode(resp.responseText);
                } catch (e) {
                    res = { success: false, error: resp.responseText || String(e) };
                }
                // Refresh status after a brief delay
                var me = this;
                window.setTimeout(function () { me._loadAll(); }, 1500);
                this._setControlButtonsDisabled(false);
                if (res.success) {
                    if (resultCmp) {
                        resultCmp.setValue(_V("ctrl", "action_done").replace("{action}", actionText));
                    }
                } else {
                    if (resultCmp) {
                        resultCmp.setValue(_V("ctrl", "action_failed").replace("{action}", actionText));
                    }
                    var detail = res.output || res.error || "";
                    if (res.log_tail) {
                        detail += "\n\n" + res.log_tail;
                    }
                    SYNO.SDS.MessageBoxV5.alert(
                        _V("ctrl", "action_failed").replace("{action}", actionText) +
                        (detail ? "\n\n" + detail : "")
                    );
                }
            },
            failure: function () {
                this._setControlButtonsDisabled(false);
                if (resultCmp) {
                    resultCmp.setValue(_V("ctrl", "request_failed"));
                }
                SYNO.SDS.MessageBoxV5.alert(_V("ctrl", "request_failed"));
            },
        });
    },

    // ── Tab: Agent ───────────────────────────────────────────────────────────

    _createAgentTab: function () {
        return [new SYNO.ux.FieldSet({
            title: _V("agent", "title"),
            collapsible: false,
            items: [
                { xtype: "syno_textfield", id: this._cmpId("vsb_virtio_port"),
                  fieldLabel: _V("agent", "virtio_port"),
                  helpText: _V("agent", "virtio_port_desc"),
                  anchor: "95%" },
                { xtype: "syno_textfield", id: this._cmpId("vsb_scan_root"),
                  fieldLabel: _V("agent", "scan_root"),
                  helpText: _V("agent", "scan_root_desc"),
                  anchor: "95%" },
                { xtype: "syno_textfield", id: this._cmpId("vsb_hwmon_name_template"),
                  fieldLabel: _V("agent", "hwmon_name_template"),
                  helpText: _V("agent", "hwmon_name_template_desc"),
                  anchor: "95%" },
                { xtype: "syno_numberfield", id: this._cmpId("vsb_rescan_seconds"),
                  fieldLabel: _V("agent", "rescan_seconds"),
                  minValue: 1, maxValue: 3600, width: 100 },
                { xtype: "syno_numberfield", id: this._cmpId("vsb_sample_seconds"),
                  fieldLabel: _V("agent", "sample_seconds"),
                  minValue: 1, maxValue: 3600, width: 100 },
                { xtype: "syno_numberfield", id: this._cmpId("vsb_heartbeat_seconds"),
                  fieldLabel: _V("agent", "heartbeat_seconds"),
                  minValue: 1, maxValue: 3600, width: 100 },
            ],
        })];
    },

    // ── Tab: Sources (HBA + SmartCTL) ────────────────────────────────────────

    _createHbaFieldset: function () {
        return new SYNO.ux.FieldSet({
            title: _V("hba", "title"),
            collapsible: true,
            items: [
                { xtype: "syno_checkbox", id: this._cmpId("vsb_hba_enabled"),
                  boxLabel: _V("hba", "enabled"), hideLabel: true },
                { xtype: "syno_textarea", id: this._cmpId("vsb_hba_devices"),
                  fieldLabel: _V("hba", "devices"),
                  height: 70, anchor: "95%" },
                { xtype: "syno_numberfield", id: this._cmpId("vsb_hba_max_ioc"),
                  fieldLabel: _V("hba", "max_ioc"),
                  minValue: 1, maxValue: 64, width: 100 },
                { xtype: "syno_textfield", id: this._cmpId("vsb_hba_label"),
                  fieldLabel: _V("hba", "label_template"),
                  helpText: _V("hba", "label_template_desc"),
                  anchor: "95%" },
            ],
        });
    },

    _createSmartctlFieldset: function () {
        return new SYNO.ux.FieldSet({
            title: _V("smartctl", "title"),
            collapsible: true,
            items: [
                { xtype: "syno_checkbox", id: this._cmpId("vsb_sctl_enabled"),
                  boxLabel: _V("smartctl", "enabled"), hideLabel: true },
                { xtype: "syno_textfield", id: this._cmpId("vsb_sctl_command"),
                  fieldLabel: _V("smartctl", "command"), anchor: "95%" },
                { xtype: "syno_textarea", id: this._cmpId("vsb_sctl_globs"),
                  fieldLabel: _V("smartctl", "device_globs"),
                  height: 60, anchor: "95%" },
                { xtype: "syno_numberfield", id: this._cmpId("vsb_sctl_timeout"),
                  fieldLabel: _V("smartctl", "timeout_seconds"),
                  minValue: 1, maxValue: 120, width: 100 },
                { xtype: "syno_numberfield", id: this._cmpId("vsb_sctl_poll"),
                  fieldLabel: _V("smartctl", "poll_seconds"),
                  minValue: 1, maxValue: 3600, width: 100 },
                { xtype: "syno_textfield", id: this._cmpId("vsb_sctl_label"),
                  fieldLabel: _V("smartctl", "label_template"),
                  helpText: _V("smartctl", "label_template_desc"),
                  anchor: "95%" },
            ],
        });
    },

    // ── Tab: Sensors (all discovered sensors) ───────────────────────────────

    _createSensorsGrid: function () {
        var me = this;

        // Store for ALL discovered sensors (read-only display)
        var allSensorsStore = new Ext.data.ArrayStore({
            fields: [
                "index", "sensor_id", "kind", "label", "value",
                "src_type", "src_chip", "src_input", "src_label",
                "src_devpath", "src_device", "src_ioc",
            ],
        });
        this._allSensorsStore = allSensorsStore;

        var statusId = this._cmpId("vsb_all_sensors_status");

        var loadAllSensors = function () {
            var sc = Ext.getCmp(statusId);
            if (sc) sc.setValue(_V("sensors", "discover_loading"));
            Ext.Ajax.request({
                url: CGI_BASE + "discover-sensors.cgi",
                method: "GET",
                timeout: 70000,
                success: function (resp) {
                    var res;
                    try { res = Ext.decode(resp.responseText); }
                    catch (e) { res = { success: false, error: String(e) }; }
                    var sc2 = Ext.getCmp(statusId);
                    if (!res.success) {
                        allSensorsStore.loadData([]);
                        if (sc2) sc2.setValue(_V("sensors", "discover_failed") + (res.error ? " " + res.error : ""));
                        return;
                    }
                    var rows = [];
                    Ext.each(res.sensors || [], function (sensor) {
                        var src = sensor.source || {};
                        rows.push([
                            sensor.index,
                            sensor.id || "",
                            sensor.kind || "temperature",
                            sensor.label || sensor.summary|| sensor.id || "",
                            sensor.value || 0,
                            src.type || "hwmon",
                            src.chip_name || "",
                            src.input || "",
                            src.source_label || "",
                            src.device_path_contains || "",
                            src.device || "",
                            src.ioc !== undefined ? src.ioc : 0,
                        ]);
                    });
                    allSensorsStore.loadData(rows);
                    if (sc2) {
                        sc2.setValue(rows.length ? _V("sensors", "discover_done") : _V("sensors", "discover_empty"));
                    }
                },
                failure: function () {
                    var sc2 = Ext.getCmp(statusId);
                    if (sc2) sc2.setValue(_V("sensors", "discover_failed"));
                },
            });
        };

        var selModel = new Ext.grid.RowSelectionModel({ singleSelect: true });

        var contextMenu = new SYNO.ux.Menu({
            items: [
                {
                    text: _V("sensors", "ctx_add_persistent"),
                    iconCls: "add",
                    handler: function () {
                        var sel = selModel.getSelected();
                        if (!sel) return;
                        me._openSensorDialog(null, {
                            id:            sel.get("sensor_id"),
                            kind:          sel.get("kind"),
                            label:         sel.get("label"),
                            default_value: sel.get("value"),
                            src_type:      sel.get("src_type"),
                            src_chip:      sel.get("src_chip"),
                            src_input:     sel.get("src_input"),
                            src_label:     sel.get("src_label"),
                            src_devpath:   sel.get("src_devpath"),
                            src_device:    sel.get("src_device"),
                            src_ioc:       sel.get("src_ioc"),
                        });
                    },
                },
            ],
        });

        var tbar = new SYNO.ux.Toolbar({
            items: [
                {
                    xtype: "syno_button",
                    text: _V("sensors", "refresh"),
                    iconCls: "refresh",
                    handler: loadAllSensors,
                },
                {
                    xtype: "syno_textfield",
                    emptyText: _V("sensors", "search"),
                    width: 200,
                    enableKeyEvents: true,
                    listeners: {
                        keyup: function (f) {
                            var q = (f.getValue() || "").toLowerCase().trim();
                            if (q) {
                                allSensorsStore.filterBy(function (rec) {
                                    return (rec.get("label")     || "").toLowerCase().indexOf(q) >= 0
                                        || (rec.get("kind")      || "").toLowerCase().indexOf(q) >= 0
                                        || (rec.get("src_chip")  || "").toLowerCase().indexOf(q) >= 0
                                        || (rec.get("sensor_id") || "").toLowerCase().indexOf(q) >= 0;
                                });
                            } else {
                                allSensorsStore.clearFilter();
                            }
                        },
                    },
                },
                { xtype: "tbseparator" },
                { xtype: "syno_displayfield", id: statusId, value: "" },
                "->",
                {
                    xtype: "syno_button",
                    text: _V("sensors", "manage_persistent"),
                    handler: function () { me._openPersistentSensorsDialog(); },
                },
            ],
        });

        var grid = new SYNO.ux.GridPanel({
            store: allSensorsStore,
            border: false,
            selModel: selModel,
            cls: "resource-monitor-performance",
            colModel: new Ext.grid.ColumnModel({
                defaults: { sortable: false, menuDisabled: true },
                columns: [
                    { header: "#",                           dataIndex: "index",    width: 40  },
                    { header: _V("sensors", "col_kind"),     dataIndex: "kind",     width: 100 },
                    { header: _V("sensors", "col_value"),    dataIndex: "value",    width: 90  },
                    { header: _V("sensors", "col_label"),    dataIndex: "label",    width: 180 },
                    { header: _V("sensors", "col_source"),   dataIndex: "src_type", width: 80  },
                    { header: _V("sensors", "col_chip"),     dataIndex: "src_chip", width: 130 },
                    { header: _V("sensors", "col_input"),    dataIndex: "src_input",width: 80  },
                ],
            }),
            viewConfig: {
                forceFit: true,
                onLoad: Ext.emptyFn,
                listeners: {
                    beforerefresh: function (v) {
                        v.scrollTop = v.scroller.dom.scrollTop;
                    },
                    refresh: function (v) {
                        v.scroller.dom.scrollTop = v.scrollTop;
                    },
                },
            },
            columnLines: true,
            frame: false,
            tbar: tbar,
            listeners: {
                rowcontextmenu: function (grid, rowIndex, e) {
                    e.stopEvent();
                    selModel.selectRow(rowIndex);
                    contextMenu.showAt(e.getXY());
                },
                render: function () {
                    loadAllSensors();
                },
            },
        });
        return grid;
    },

    // ── Persistent Sensors management dialog ────────────────────────────────

    _openPersistentSensorsDialog: function () {
        var me = this;
        var store = this._sensorStore;
        var selModel = new Ext.grid.RowSelectionModel({ singleSelect: true });

        var tbar = new SYNO.ux.Toolbar({
            items: [
                {
                    xtype: "syno_button",
                    text: _V("sensors", "add"),
                    iconCls: "add",
                    handler: function () { me._openSensorDialog(null); },
                },
                {
                    xtype: "syno_button",
                    text: _V("sensors", "edit"),
                    iconCls: "edit",
                    handler: function () {
                        var sel = selModel.getSelected();
                        if (sel) me._openSensorDialog(sel);
                    },
                },
                {
                    xtype: "syno_button",
                    text: _V("sensors", "delete"),
                    iconCls: "remove",
                    handler: function () {
                        var sel = selModel.getSelected();
                        if (sel) store.remove(sel);
                    },
                },
            ],
        });

        var grid = new SYNO.ux.GridPanel({
            store: store,
            border: false,
            selModel: selModel,
            cls: "resource-monitor-performance",
            colModel: new Ext.grid.ColumnModel({
                defaults: { sortable: false, menuDisabled: true },
                columns: [
                    { header: _V("sensors", "col_id"),      dataIndex: "id",            width: 130 },
                    { header: _V("sensors", "col_kind"),     dataIndex: "kind",          width: 100 },
                    { header: _V("sensors", "col_label"),    dataIndex: "label",         width: 160 },
                    { header: _V("sensors", "col_default"),  dataIndex: "default_value", width: 100 },
                    { header: _V("sensors", "col_source"),   dataIndex: "src_type",      width: 90  },
                ],
            }),
            viewConfig: {
                forceFit: true,
                onLoad: Ext.emptyFn,
                listeners: {
                    beforerefresh: function (v) {
                        v.scrollTop = v.scroller.dom.scrollTop;
                    },
                    refresh: function (v) {
                        v.scroller.dom.scrollTop = v.scrollTop;
                    },
                },
            },
            columnLines: true,
            frame: false,
            tbar: tbar,
        });

        var win = new SYNO.SDS.ModalWindow({
            title: _V("sensors", "persistent_title"),
            modal: true,
            width: 600,
            height: 400,
            resizable: true,
            layout: "fit",
            closeAction: "destroy",
            items: [grid],
            buttons: [
                {
                    xtype: "syno_button",
                    btnStyle: "blue",
                    text: _V("save", "btn_save"),
                    handler: function () {
                        me._doSave(false);
                        win.close();
                    },
                },
                {
                    xtype: "syno_button",
                    text: _V("sensors", "btn_cancel"),
                    handler: function () { win.close(); },
                },
            ],
        });
        win.open();
    },

    _openSensorDialog: function (record, prefill) {
        var store = this._sensorStore;
        var isNew = !record;
        var data  = record ? record.data : (prefill || {});
        var dlgPrefix = this._cmpId("sensor_dlg_" + Ext.id() + "_");
        var dlgId = function (name) { return dlgPrefix + name; };
        var dlgCmp = function (name) { return Ext.getCmp(dlgId(name)); };

        var win = new SYNO.SDS.ModalWindow({
            title: isNew ? _V("sensors", "dlg_add") : _V("sensors", "dlg_edit"),
            modal: true,
            width: 520,
            height: 400,
            resizable: false,
            layout: "fit",
            closeAction: "destroy",
            items: [
                {
                    xtype: "syno_formpanel",
                    bodyStyle: "padding:10px",
                    autoScroll: true,
                    labelWidth: 150,
                    items: [
                        { xtype: "syno_textfield",   id: dlgId("id"),        fieldLabel: _V("sensors", "id"),            value: data.id || "",            anchor: "95%" },
                        { xtype: "syno_textfield",   id: dlgId("kind"),      fieldLabel: _V("sensors", "kind"),          value: data.kind || "temperature", anchor: "95%" },
                        { xtype: "syno_textfield",   id: dlgId("label"),     fieldLabel: _V("sensors", "label"),         value: data.label || "",         anchor: "95%" },
                        { xtype: "syno_numberfield", id: dlgId("default"),   fieldLabel: _V("sensors", "default_value"), value: data.default_value || 0,   width: 120,
                          helpText: _V("sensors", "default_value_desc") },
                        { xtype: "syno_textfield",   id: dlgId("src_type"),  fieldLabel: _V("sensors", "source_type"),   value: data.src_type || "hwmon",  anchor: "95%" },
                        { xtype: "syno_textfield",   id: dlgId("chip"),      fieldLabel: _V("sensors", "source_chip"),   value: data.src_chip || "",      anchor: "95%" },
                        { xtype: "syno_textfield",   id: dlgId("input"),     fieldLabel: _V("sensors", "input"),         value: data.src_input || "",     anchor: "95%" },
                        { xtype: "syno_textfield",   id: dlgId("src_label"), fieldLabel: _V("sensors", "source_label"),  value: data.src_label || "",     anchor: "95%" },
                        { xtype: "syno_textfield",   id: dlgId("devpath"),   fieldLabel: _V("sensors", "source_devpath"),value: data.src_devpath || "",   anchor: "95%" },
                        { xtype: "syno_textfield",   id: dlgId("device"),    fieldLabel: _V("sensors", "source_device"), value: data.src_device || "",    anchor: "95%" },
                        { xtype: "syno_numberfield", id: dlgId("ioc"),       fieldLabel: _V("sensors", "source_ioc"),    value: data.src_ioc || 0,        width: 120 },
                    ],
                },
            ],
            buttons: [
                { xtype: "syno_button", text: _V("sensors", "btn_cancel"), handler: function () { win.close(); } },
                {
                    xtype: "syno_button",
                    btnStyle: "blue",
                    text: _V("sensors", "btn_ok"),
                    handler: function () {
                        var rowData = {
                            id:            dlgCmp("id").getValue(),
                            kind:          dlgCmp("kind").getValue(),
                            label:         dlgCmp("label").getValue(),
                            default_value: parseInt(dlgCmp("default").getValue(), 10) || 0,
                            src_type:      dlgCmp("src_type").getValue(),
                            src_chip:      dlgCmp("chip").getValue(),
                            src_input:     dlgCmp("input").getValue(),
                            src_label:     dlgCmp("src_label").getValue(),
                            src_devpath:   dlgCmp("devpath").getValue(),
                            src_device:    dlgCmp("device").getValue(),
                            src_ioc:       parseInt(dlgCmp("ioc").getValue(), 10) || 0,
                        };
                        if (isNew) {
                            store.add(new store.recordType(rowData));
                        } else {
                            record.set("id",            rowData.id);
                            record.set("kind",          rowData.kind);
                            record.set("label",         rowData.label);
                            record.set("default_value", rowData.default_value);
                            record.set("src_type",      rowData.src_type);
                            record.set("src_chip",      rowData.src_chip);
                            record.set("src_input",     rowData.src_input);
                            record.set("src_label",     rowData.src_label);
                            record.set("src_devpath",   rowData.src_devpath);
                            record.set("src_device",    rowData.src_device);
                            record.set("src_ioc",       rowData.src_ioc);
                            record.commit();
                        }
                        win.close();
                    },
                },
            ],
        });
        win.open();
    },

    // ── Tab: Config Editor ─────────────────────────────────────────────────

    _createConfigEditorTab: function () {
        var me = this;
        var loadRaw = function () {
            Ext.Ajax.request({
                url: CGI_BASE + "get-config.cgi?raw=1",
                method: "GET",
                timeout: 15000,
                scope: me,
                success: function (resp) {
                    var res;
                    try { res = Ext.decode(resp.responseText); }
                    catch (e) { res = { success: false, error: String(e) }; }
                    var cmp = me._cmp("vsb_raw_config");
                    if (cmp) {
                        if (res.success) {
                            cmp.setValue(res.raw_content || "");
                        } else {
                            cmp.setValue("# " + (res.error || "Failed to load"));
                        }
                    }
                },
                failure: function () {
                    var cmp = me._cmp("vsb_raw_config");
                    if (cmp) cmp.setValue("# Request failed");
                },
            });
        };
        var saveRaw = function (restart) {
            var cmp = me._cmp("vsb_raw_config");
            if (!cmp) return;
            Ext.Ajax.request({
                url: CGI_BASE + "save-config.cgi",
                method: "POST",
                jsonData: { raw_content: cmp.getValue(), restart: !!restart },
                timeout: 30000,
                success: function (resp) {
                    var res;
                    try { res = Ext.decode(resp.responseText); }
                    catch (e) { res = { success: false, error: String(e) }; }
                    if (res.success) {
                        me._loadAll();
                        SYNO.SDS.MessageBoxV5.alert(
                            _V("save", restart ? "saved_restart_ok" : "saved_ok")
                        );
                    } else {
                        SYNO.SDS.MessageBoxV5.alert(
                            _V("save", "save_failed") + (res.error ? " " + res.error : "")
                        );
                    }
                },
                failure: function () {
                    SYNO.SDS.MessageBoxV5.alert(_V("save", "save_failed"));
                },
            });
        };
        return {
            xtype: "panel",
            border: false,
            layout: "fit",
            tbar: [
                {
                    xtype: "syno_button",
                    text: _V("config_editor", "reload"),
                    iconCls: "refresh",
                    handler: loadRaw,
                },
                "->",
                {
                    xtype: "syno_button",
                    btnStyle: "blue",
                    text: _V("save", "btn_save"),
                    handler: function () { saveRaw(false); },
                },
                {
                    xtype: "syno_button",
                    text: _V("save", "btn_save_restart"),
                    style: "margin-left:8px;",
                    handler: function () { saveRaw(true); },
                },
            ],
            items: [
                {
                    xtype: "syno_textarea",
                    id: this._cmpId("vsb_raw_config"),
                    readOnly: false,
                    hideLabel: true,
                    value: "",
                    style: "font-family:monospace; font-size:12px;",
                    anchor: "100% 100%",
                    listeners: {
                        render: loadRaw,
                    },
                },
            ],
        };
    },

    // ── Tab: Logs ────────────────────────────────────────────────────────────

    _createLogsTab: function () {
        var me = this;
        return {
            xtype: "panel",
            border: false,
            layout: "fit",
            tbar: [
                {
                    xtype: "syno_button",
                    text: _V("logs", "refresh"),
                    iconCls: "refresh",
                    handler: function () {
                        Ext.Ajax.request({
                            url: CGI_BASE + "status.cgi",
                            method: "GET",
                            timeout: 15000,
                            scope: me,
                            success: function (resp) {
                                var data = Ext.decode(resp.responseText);
                                var cmp = me._cmp("vsb_log_area");
                                if (cmp) cmp.setValue(data.log_tail || _V("logs", "empty"));
                            },
                        });
                    },
                },
            ],
            items: [
                {
                    xtype: "syno_textarea",
                    id: this._cmpId("vsb_log_area"),
                    readOnly: true,
                    hideLabel: true,
                    value: _V("logs", "empty"),
                    style: "font-family:monospace; font-size:11px;",
                    anchor: "100% 100%",
                },
            ],
        };
    },
});
