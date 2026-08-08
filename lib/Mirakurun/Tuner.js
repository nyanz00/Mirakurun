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
exports.Tuner = void 0;
const common = __importStar(require("./common"));
const log = __importStar(require("./log"));
const _1 = __importDefault(require("./_"));
const TunerDevice_1 = __importDefault(require("./TunerDevice"));
const TSFilter_1 = __importDefault(require("./TSFilter"));
const TSDecoder_1 = __importDefault(require("./TSDecoder"));
class Tuner {
    _devices = [];
    _readyForJobPickedDeviceSet = new Set();
    constructor() {
        this._load();
    }
    get devices() {
        return this._devices.map(device => device.toJSON());
    }
    get(index) {
        const l = this._devices.length;
        for (let i = 0; i < l; i++) {
            if (this._devices[i].index === index) {
                return this._devices[i];
            }
        }
        return null;
    }
    async readyForJob(channel) {
        const devices = this._getDevicesByType(channel.type);
        if (devices.length === 0) {
            log.error("readyForJob: no tuners for channel type: %s", channel.type);
            return false;
        }
        while (true) {
            const pickableDevices = devices.filter(device => !this._readyForJobPickedDeviceSet.has(device));
            if (pickableDevices.length === 0) {
                log.debug("readyForJob: no pickable tuners for channel type: %s", channel.type);
                await common.sleep(1000 * 10);
                continue;
            }
            const device = this._pickTunerDevice(pickableDevices, channel, -1);
            if (device === null) {
                await common.sleep(1000 * 10);
                continue;
            }
            this._readyForJobPickedDeviceSet.add(device);
            log.debug("readyForJob: picked device: #%d (%s)", device.config.name);
            setTimeout(() => {
                this._readyForJobPickedDeviceSet.delete(device);
                log.debug("readyForJob: released device: #%d (%s)", device.index, device.config.name);
            }, 1000 * 5);
            return true;
        }
    }
    typeExists(type) {
        const l = this._devices.length;
        for (let i = 0; i < l; i++) {
            if (this._devices[i].config.types.includes(type) === true) {
                return true;
            }
        }
        return false;
    }
    getRemoteDeviceByChannel(channel) {
        for (const device of this._devices) {
            if (device.isRemote === true && device.config.types.includes(channel.type) === true) {
                return device;
            }
        }
        return null;
    }
    async hasRemoteLogoData(service) {
        if (typeof service.logoId !== "number" || service.logoId < 0) {
            return false;
        }
        const device = this.getRemoteDeviceByChannel(service.channel);
        if (device === null) {
            return false;
        }
        return device.hasRemoteLogoData(service.id);
    }
    initChannelStream(channel, userReq, output) {
        let networkId;
        const services = channel.getServices();
        if (services.length !== 0) {
            networkId = services[0].networkId;
        }
        return this._initTS({
            ...userReq,
            streamSetting: {
                channel,
                networkId,
                parseEIT: true
            }
        }, output);
    }
    initServiceStream(service, userReq, output) {
        return this._initTS({
            ...userReq,
            streamSetting: {
                channel: service.channel,
                serviceId: service.serviceId,
                networkId: service.networkId,
                parseEIT: true
            }
        }, output);
    }
    initProgramStream(program, userReq, output) {
        return this._initTS({
            ...userReq,
            streamSetting: {
                channel: _1.default.service.get(program.networkId, program.serviceId).channel,
                serviceId: program.serviceId,
                eventId: program.eventId,
                networkId: program.networkId,
                parseEIT: true
            }
        }, output);
    }
    async getEPG(channel, time) {
        let timeout;
        if (!time) {
            time = _1.default.config.server.epgRetrievalTime || 1000 * 60 * 10;
        }
        let networkId;
        const services = channel.getServices();
        if (services.length === 0) {
            throw new Error("no available services in channel");
        }
        networkId = services[0].networkId;
        const tsFilter = await this._initTS({
            id: "Mirakurun:getEPG()",
            priority: -1,
            disableDecoder: true,
            streamSetting: {
                channel,
                networkId,
                parseEIT: true
            }
        });
        if (tsFilter === null) {
            return;
        }
        return new Promise((resolve) => {
            const fin = () => {
                clearTimeout(timeout);
                tsFilter.close();
            };
            timeout = setTimeout(fin, time);
            tsFilter.once("epgReady", fin);
            tsFilter.once("close", () => {
                fin();
                resolve();
            });
        });
    }
    async getServices(channel, user = {}) {
        const tsFilter = await this._initTS({
            id: "Mirakurun:getServices()",
            priority: -1,
            disableDecoder: true,
            streamSetting: {
                channel,
                parseNIT: true,
                parseSDT: true
            },
            ...user
        });
        return new Promise((resolve, reject) => {
            let network = {
                networkId: -1,
                areaCode: -1,
                remoteControlKeyId: -1
            };
            let services = null;
            setTimeout(() => tsFilter.close(), 20000);
            Promise.all([
                new Promise((resolve, reject) => {
                    tsFilter.once("network", _network => {
                        network = _network;
                        resolve();
                    });
                }),
                new Promise((resolve, reject) => {
                    tsFilter.once("services", _services => {
                        services = _services;
                        resolve();
                    });
                })
            ]).then(() => tsFilter.close());
            tsFilter.once("close", () => {
                tsFilter.removeAllListeners("network");
                tsFilter.removeAllListeners("services");
                if (network.networkId === -1) {
                    reject(new Error("stream has closed before get network"));
                }
                else if (services === null) {
                    reject(new Error("stream has closed before get services"));
                }
                else {
                    if (network.remoteControlKeyId !== -1) {
                        services.forEach(service => {
                            service.remoteControlKeyId = network.remoteControlKeyId;
                        });
                    }
                    resolve(services);
                }
            });
        });
    }
    _load() {
        log.debug("loading tuners...");
        const tuners = _1.default.config.tuners;
        tuners.forEach((tuner, i) => {
            if (!tuner.name || !tuner.types || (!tuner.remoteMirakurunHost && !tuner.command)) {
                log.error("missing required property in tuner#%s configuration", i);
                return;
            }
            if (typeof tuner.name !== "string") {
                log.error("invalid type of property `name` in tuner#%s configuration", i);
                return;
            }
            if (Array.isArray(tuner.types) === false) {
                console.log(tuner);
                log.error("invalid type of property `types` in tuner#%s configuration", i);
                return;
            }
            if (!tuner.remoteMirakurunHost && typeof tuner.command !== "string") {
                log.error("invalid type of property `command` in tuner#%s configuration", i);
                return;
            }
            if (tuner.dvbDevicePath && typeof tuner.dvbDevicePath !== "string") {
                log.error("invalid type of property `dvbDevicePath` in tuner#%s configuration", i);
                return;
            }
            if (tuner.remoteMirakurunHost && typeof tuner.remoteMirakurunHost !== "string") {
                log.error("invalid type of property `remoteMirakurunHost` in tuner#%s configuration", i);
                return;
            }
            if (tuner.remoteMirakurunPort && Number.isInteger(tuner.remoteMirakurunPort) === false) {
                log.error("invalid type of property `remoteMirakurunPort` in tuner#%s configuration", i);
                return;
            }
            if (tuner.remoteMirakurunDecoder !== undefined && typeof tuner.remoteMirakurunDecoder !== "boolean") {
                log.error("invalid type of property `remoteMirakurunDecoder` in tuner#%s configuration", i);
                return;
            }
            if (tuner.isDisabled) {
                return;
            }
            this._devices.push(new TunerDevice_1.default(i, tuner));
        });
        log.info("%s of %s tuners loaded", this._devices.length, tuners.length);
        return this;
    }
    async _initTS(user, dest) {
        const setting = user.streamSetting;
        if (_1.default.config.server.disableEITParsing === true) {
            setting.parseEIT = false;
        }
        const devices = this._getDevicesByType(setting.channel.type);
        let tryCount = 50;
        if (!dest) {
            const remoteResult = await this._useRemoteData(user, devices);
            if (remoteResult) {
                return null;
            }
        }
        while (tryCount > 0) {
            const device = this._pickTunerDevice(devices, setting.channel, user.priority);
            if (device === null) {
                tryCount--;
                if (tryCount <= 0) {
                    throw new Error("no available tuners");
                }
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            else {
                let output;
                if (user.disableDecoder === true || device.decoder === null) {
                    output = dest;
                }
                else {
                    output = new TSDecoder_1.default({
                        output: dest,
                        command: device.decoder
                    });
                }
                const tsFilter = new TSFilter_1.default({
                    output,
                    networkId: setting.networkId,
                    serviceId: setting.serviceId,
                    eventId: setting.eventId,
                    parseNIT: setting.parseNIT,
                    parseSDT: setting.parseSDT,
                    parseEIT: setting.parseEIT,
                    tsmfRelTs: setting.channel.tsmfRelTs
                });
                Object.defineProperty(user, "streamInfo", {
                    get: () => tsFilter.streamInfo
                });
                try {
                    await device.startStream(user, tsFilter, setting.channel);
                    return tsFilter;
                }
                catch (err) {
                    tsFilter.end();
                    throw err;
                }
            }
        }
    }
    async _useRemoteData(user, devices) {
        const setting = user.streamSetting;
        const remoteDevice = devices.find(device => device.isRemote);
        if (remoteDevice && setting.networkId !== undefined && setting.parseEIT === true) {
            try {
                const programs = await remoteDevice.getRemotePrograms({ networkId: setting.networkId });
                await common.sleep(1000);
                _1.default.program.findByNetworkIdAndReplace(setting.networkId, programs, true);
                for (const service of _1.default.service.findByNetworkId(setting.networkId)) {
                    service.epgReady = true;
                }
                await common.sleep(1000);
                return true;
            }
            catch (err) {
                throw err;
            }
        }
        return false;
    }
    _pickTunerDevice(devices, channel, priority) {
        for (const device of devices) {
            if (device.isAvailable === true && device.channel === channel) {
                return device;
            }
        }
        for (const device of devices) {
            if (device.isFree === true) {
                return device;
            }
        }
        for (const device of devices) {
            if (device.isAvailable === true && device.users.length === 0) {
                return device;
            }
        }
        if (priority >= 0) {
            devices.sort((t1, t2) => t1.getPriority() - t2.getPriority());
            for (const device of devices) {
                if (device.isUsing === true && device.getPriority() < priority) {
                    return device;
                }
            }
        }
        return null;
    }
    _getDevicesByType(type) {
        const devices = [];
        for (const device of this._devices) {
            if (device.config.types.includes(type) === true) {
                devices.push(device);
            }
        }
        return devices;
    }
}
exports.Tuner = Tuner;
exports.default = Tuner;
//# sourceMappingURL=Tuner.js.map