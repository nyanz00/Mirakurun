"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Channel = void 0;
const common = __importStar(require("./common"));
const log = __importStar(require("./log"));
const _1 = __importDefault(require("./_"));
const status_1 = __importDefault(require("./status"));
const ChannelItem_1 = __importDefault(require("./ChannelItem"));
class Channel {
    _items = [];
    _startup = true;
    constructor() {
        this._load();
        if (_1.default.config.server.disableEITParsing !== true) {
            const epgJob = {
                key: "EPG.Gatherer",
                name: "EPG Gatherer",
                fn: () => this._epgGatherer()
            };
            _1.default.job.add({
                ...epgJob,
                readyFn: async () => {
                    await common.sleep(1000 * 60);
                    return true;
                }
            });
            _1.default.job.addSchedule({
                key: epgJob.key,
                schedule: _1.default.config.server.epgGatheringJobSchedule || "20,50 * * * *",
                job: epgJob
            });
        }
    }
    get items() {
        return this._items;
    }
    add(item) {
        if (this.get(item.type, item.channel) === null) {
            this._items.push(item);
        }
    }
    get(type, channel) {
        const l = this._items.length;
        for (let i = 0; i < l; i++) {
            if (this._items[i].channel === channel && this._items[i].type === type) {
                return this._items[i];
            }
        }
        return null;
    }
    findByType(type) {
        const items = [];
        const l = this._items.length;
        for (let i = 0; i < l; i++) {
            if (this._items[i].type === type) {
                items.push(this._items[i]);
            }
        }
        return items;
    }
    _load() {
        log.debug("loading channels...");
        const channels = _1.default.config.channels;
        channels.forEach((channel, i) => {
            if (typeof channel.name !== "string") {
                log.error("invalid type of property `name` in channel#%d configuration", i);
                return;
            }
            if (common.channelTypes.includes(channel.type) === false) {
                log.error("invalid type of property `type` in channel#%d (%s) configuration", i, channel.name);
                return;
            }
            if (typeof channel.channel !== "string") {
                log.error("invalid type of property `channel` in channel#%d (%s) configuration", i, channel.name);
                return;
            }
            if (channel.serviceId && typeof channel.serviceId !== "number") {
                log.error("invalid type of property `serviceId` in channel#%d (%s) configuration", i, channel.name);
                return;
            }
            if (channel.tsmfRelTs && typeof channel.tsmfRelTs !== "number") {
                log.error("invalid type of property `tsmfRelTs` in channel#%d (%s) configuration", i, channel.name);
                return;
            }
            if (channel.commandVars && typeof channel.commandVars !== "object") {
                log.error("invalid type of property `commandVars` in channel#%d (%s) configuration", i, channel.name);
                return;
            }
            if (!channel.commandVars) {
                channel.commandVars = {};
            }
            if (channel.satelite && !channel.satellite) {
                log.warn("renaming deprecated property name `satelite` to `satellite` in channel#%d (%s) configuration", i, channel.name);
                channel.satellite = channel.satelite;
            }
            if (channel.satellite) {
                if (!channel.commandVars.satellite) {
                    channel.commandVars.satellite = channel.satellite;
                }
            }
            if (channel.space) {
                if (!channel.commandVars.space) {
                    channel.commandVars.space = channel.space;
                }
            }
            if (channel.freq) {
                if (!channel.commandVars.freq) {
                    channel.commandVars.freq = channel.freq;
                }
            }
            if (channel.polarity) {
                if (!channel.commandVars.polarity) {
                    channel.commandVars.polarity = channel.polarity;
                }
            }
            for (const key in channel.commandVars) {
                if (typeof channel.commandVars[key] !== "number" && typeof channel.commandVars[key] !== "string") {
                    log.error("invalid type of property `commandVars.%s` in channel#%d (%s) configuration", key, i, channel.name);
                    delete channel.commandVars[key];
                }
            }
            if (channel.isDisabled === true) {
                return;
            }
            if (_1.default.tuner.typeExists(channel.type) === false) {
                return;
            }
            if (!this.get(channel.type, channel.channel)) {
                if (channel.serviceId) {
                    channel.name = `${channel.type}:${channel.channel}`;
                }
                this.add(new ChannelItem_1.default(channel));
            }
        });
    }
    async _epgGatherer() {
        const startup = this._startup;
        if (this._startup === true) {
            this._startup = false;
        }
        const networkIds = [...new Set(_1.default.service.items.map(item => item.networkId))];
        for (const networkId of networkIds) {
            const services = _1.default.service.findByNetworkId(networkId);
            if (services.length === 0) {
                continue;
            }
            const service = services[0];
            _1.default.job.add({
                key: `EPG.Gather.NID.${networkId}`,
                name: `EPG Gather Network#${networkId}`,
                isRerunnable: true,
                fn: async () => {
                    log.info("Network#%d EPG gathering has started", networkId);
                    try {
                        await _1.default.tuner.getEPG(service.channel);
                        log.info("Network#%d EPG gathering has finished", networkId);
                    }
                    catch (e) {
                        log.warn("Network#%d EPG gathering has failed [%s]", networkId, e);
                        throw new Error("EPG gathering failed");
                    }
                },
                readyFn: async () => {
                    await common.sleep(100);
                    if (status_1.default.epg[networkId] === true) {
                        log.info("Network#%d EPG gathering is already in progress on another stream", networkId);
                        return false;
                    }
                    if (service.epgReady === true) {
                        const now = Date.now();
                        if (startup && now - service.epgUpdatedAt < 1000 * 60 * 10) {
                            log.info("Network#%d EPG gathering has skipped because EPG is already up to date (in 10 mins)", networkId);
                            return false;
                        }
                        if (now - service.epgUpdatedAt > 1000 * 60 * 60 * 12) {
                            log.info("Network#%d EPG gathering is resuming forcibly because reached maximum pause time (12 hours)", networkId);
                            service.epgReady = false;
                        }
                        else {
                            const currentPrograms = _1.default.program.findByNetworkIdAndTime(networkId, now)
                                .filter(program => !!program.name && program.name !== "放送休止");
                            if (currentPrograms.length === 0) {
                                const networkPrograms = _1.default.program.findByNetworkId(networkId);
                                if (networkPrograms.length > 0) {
                                    log.info("Network#%d EPG gathering has skipped because broadcast is off", networkId);
                                    return false;
                                }
                                service.epgReady = false;
                            }
                        }
                    }
                    return _1.default.tuner.readyForJob(service.channel);
                }
            });
        }
    }
}
exports.Channel = Channel;
exports.default = Channel;
//# sourceMappingURL=Channel.js.map