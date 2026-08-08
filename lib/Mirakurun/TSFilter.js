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
const EventEmitter = require("eventemitter3");
const aribts_1 = require("@chinachu/aribts");
const common_1 = require("./common");
const log = __importStar(require("./log"));
const EPG_1 = __importDefault(require("./EPG"));
const status_1 = __importDefault(require("./status"));
const _1 = __importDefault(require("./_"));
const Program_1 = require("./Program");
const Service_1 = __importDefault(require("./Service"));
const PACKET_SIZE = 188;
const PROVIDE_PIDS = [
    0x0000,
    0x0001,
    0x0010,
    0x0011,
    0x0012,
    0x0013,
    0x0014,
    0x0023,
    0x0024,
    0x0028,
    0x0029
];
const DSMCC_BLOCK_SIZE = 4066;
const LOGO_DATA_NAME_BS = Buffer.from("LOGO-05");
const LOGO_DATA_NAME_CS = Buffer.from("CS_LOGO-05");
class TSFilter extends EventEmitter {
    streamInfo = {};
    _output;
    _provideServiceId;
    _provideEventId;
    _parseNIT = false;
    _parseSDT = false;
    _parseEIT = false;
    _targetNetworkId;
    _enableParseCDT = false;
    _enableParseDSMCC = false;
    _tsmfEnableTsmfSplit = false;
    _tsmfSlotCounter = -1;
    _tsmfRelativeStreamNumber = [];
    _tsmfTsNumber = 0;
    _parser = new aribts_1.TsStreamLite();
    _epg;
    _epgReady = false;
    _epgState = {};
    _packet = Buffer.allocUnsafeSlow(PACKET_SIZE).fill(0);
    _offset = -1;
    _buffer = [];
    _patsec = Buffer.allocUnsafeSlow(PACKET_SIZE - 4 - 1).fill(0);
    _patCRC = Buffer.allocUnsafeSlow(4).fill(0);
    _closed = false;
    _ready = true;
    _providePids = null;
    _parsePids = new Set();
    _tsid = -1;
    _serviceIds = new Set();
    _parseServiceIds = new Set();
    _pmtPid = -1;
    _pmtTimer;
    _streamTime = null;
    _essMap = new Map();
    _essEsPids = new Set();
    _dlDataMap = new Map();
    _logoDataTimer;
    _provideEventLastDetectedAt = -1;
    _provideEventTimeout = null;
    _continuityStateMap = new Map();
    _maxBufferBytesBeforeReady = (() => {
        let bytes = _1.default.config.server.maxBufferBytesBeforeReady || 1024 * 1024 * 8;
        bytes = bytes - bytes % PACKET_SIZE;
        return Math.max(bytes, PACKET_SIZE);
    })();
    _eventEndTimeout = _1.default.config.server.eventEndTimeout || 1000;
    constructor(options) {
        super();
        const enabletsmf = options.tsmfRelTs || 0;
        if (enabletsmf !== 0) {
            this._tsmfEnableTsmfSplit = true;
            this._tsmfTsNumber = options.tsmfRelTs;
        }
        this._targetNetworkId = options.networkId || null;
        this._provideServiceId = options.serviceId || null;
        this._provideEventId = options.eventId || null;
        if (this._provideServiceId !== null) {
            this._providePids = new Set(PROVIDE_PIDS);
            this._ready = false;
        }
        if (this._provideEventId !== null) {
            this._ready = false;
            const program = _1.default.program.get((0, Program_1.getProgramItemId)(this._targetNetworkId, this._provideServiceId, this._provideEventId));
            if (program) {
                let timeout = program.startAt + program.duration - Date.now();
                if (program.duration === 1) {
                    timeout += 1000 * 60 * 3;
                }
                if (timeout < 0) {
                    timeout = 1000 * 60 * 3;
                }
                this._provideEventTimeout = setTimeout(() => this._observeProvideEvent(), timeout);
            }
        }
        if (options.output) {
            this._output = options.output;
            this._output.once("finish", this._close.bind(this));
            this._output.once("close", this._close.bind(this));
        }
        else {
            this._provideServiceId = null;
            this._provideEventId = null;
            this._providePids = new Set();
            this._ready = false;
        }
        if (options.parseNIT === true) {
            this._parseNIT = true;
        }
        if (options.parseSDT === true) {
            this._parseSDT = true;
        }
        if (options.parseEIT === true) {
            this._parseEIT = true;
        }
        if (this._targetNetworkId) {
            if (this._targetNetworkId === 4) {
                this._enableParseDSMCC = true;
            }
            else {
                this._enableParseCDT = true;
            }
        }
        this._parser.on("pat", this._onPAT.bind(this));
        this._parser.on("pmt", this._onPMT.bind(this));
        this._parser.on("nit", this._onNIT.bind(this));
        this._parser.on("sdt", this._onSDT.bind(this));
        this._parser.on("eit", this._onEIT.bind(this));
        this._parser.on("tot", this._onTOT.bind(this));
        this.once("end", this._close.bind(this));
        this.once("close", this._close.bind(this));
        log.info("TSFilter: created (serviceId=%d, eventId=%d)", this._provideServiceId, this._provideEventId);
        if (this._ready === false) {
            log.info("TSFilter: waiting for serviceId=%d, eventId=%d", this._provideServiceId, this._provideEventId);
        }
        ++status_1.default.streamCount.tsFilter;
    }
    get closed() {
        return this._closed;
    }
    write(chunk) {
        if (this._closed) {
            throw new Error("TSFilter has closed already");
        }
        let offset = 0;
        const length = chunk.length;
        const packets = [];
        if (this._offset > 0) {
            if (length >= PACKET_SIZE - this._offset) {
                offset = PACKET_SIZE - this._offset;
                packets.push(Buffer.concat([
                    this._packet.slice(0, this._offset),
                    chunk.slice(0, offset)
                ]));
                this._offset = 0;
            }
            else {
                chunk.copy(this._packet, this._offset);
                this._offset += length;
                return;
            }
        }
        for (; offset < length; offset += PACKET_SIZE) {
            if (chunk[offset] !== 71) {
                offset -= PACKET_SIZE - 1;
                continue;
            }
            if (length - offset >= PACKET_SIZE) {
                packets.push(chunk.slice(offset, offset + PACKET_SIZE));
            }
            else {
                chunk.copy(this._packet, 0, offset);
                this._offset = length - offset;
            }
        }
        this._processPackets(packets);
        if (this._buffer.length !== 0) {
            if (this._ready && this._output.writableLength < this._output.writableHighWaterMark) {
                this._output.write(Buffer.concat(this._buffer));
                this._buffer.length = 0;
            }
            else {
                const head = this._buffer.length - (this._maxBufferBytesBeforeReady / PACKET_SIZE);
                if (head > 0) {
                    this._buffer.splice(0, head);
                }
            }
        }
    }
    end() {
        this._close();
    }
    close() {
        this._close();
    }
    _processPackets(packets) {
        const parsingBuffers = [];
        for (let packet of packets) {
            const pid = packet.readUInt16BE(1) & 0x1FFF;
            if (this._tsmfEnableTsmfSplit) {
                if (pid === 0x002F) {
                    const tsmfFlameSync = packet.readUInt16BE(4) & 0x1FFF;
                    if (tsmfFlameSync !== 0x1A86 && tsmfFlameSync !== 0x0579) {
                        continue;
                    }
                    this._tsmfRelativeStreamNumber = [];
                    for (let i = 0; i < 26; i++) {
                        this._tsmfRelativeStreamNumber.push((packet[73 + i] & 0xf0) >> 4);
                        this._tsmfRelativeStreamNumber.push(packet[73 + i] & 0x0f);
                    }
                    this._tsmfSlotCounter = 0;
                    continue;
                }
                if (this._tsmfSlotCounter < 0 || this._tsmfSlotCounter > 51) {
                    continue;
                }
                this._tsmfSlotCounter++;
                if (this._tsmfRelativeStreamNumber[this._tsmfSlotCounter - 1] !== this._tsmfTsNumber) {
                    continue;
                }
            }
            if (pid === 0x1FFF) {
                continue;
            }
            if ((packet[1] & 0x80) >> 7 === 1) {
                if (this.streamInfo[pid]) {
                    ++this.streamInfo[pid].drop;
                }
                continue;
            }
            if (pid === 0) {
                const targetStart = packet[7] + 4;
                if (targetStart + 4 > 188) {
                    if (this.streamInfo[pid]) {
                        ++this.streamInfo[pid].drop;
                    }
                    continue;
                }
                if (this._patCRC.compare(packet, targetStart, targetStart + 4) !== 0) {
                    packet.copy(this._patCRC, 0, targetStart, targetStart + 4);
                    parsingBuffers.push(packet);
                }
            }
            else if ((pid === 0x12 && (this._parseEIT || this._provideEventId !== null)) ||
                pid === 0x14 ||
                this._parsePids.has(pid)) {
                parsingBuffers.push(packet);
            }
            if (this._ready === false && (pid === 0x12 || this._provideEventId === null)) {
                continue;
            }
            if (this._providePids !== null && this._providePids.has(pid) === false) {
                continue;
            }
            if (pid === 0 && this._pmtPid !== -1) {
                packet = Buffer.from(packet);
                this._patsec.copy(packet, 5, 0);
            }
            if (this.streamInfo[pid] === undefined) {
                this.streamInfo[pid] = {
                    packet: 0,
                    drop: 0
                };
            }
            ++this.streamInfo[pid].packet;
            this._checkContinuityCounter(packet, pid);
            this._buffer.push(packet);
        }
        if (parsingBuffers.length !== 0) {
            setImmediate(() => {
                if (this._closed) {
                    return;
                }
                this._parser.write(parsingBuffers);
                parsingBuffers.length = 0;
            });
        }
    }
    _checkContinuityCounter(packet, pid) {
        const adaptationFieldControl = (packet[3] & 0x30) >> 4;
        const hasAdaptationField = adaptationFieldControl === 2 || adaptationFieldControl === 3;
        const hasPayload = adaptationFieldControl === 1 || adaptationFieldControl === 3;
        const state = this._continuityStateMap.get(pid) || {
            counter: -1,
            duplication: 0
        };
        if (hasAdaptationField && packet[4] > 0 && (packet[5] & 0x80) !== 0) {
            state.counter = -1;
            state.duplication = 0;
        }
        if (hasPayload === true) {
            const counter = packet[3] & 0x0F;
            if (state.counter !== -1) {
                const previous = state.counter;
                const expected = (previous + 1) & 0x0F;
                let dropped = false;
                if (counter === previous) {
                    ++state.duplication;
                    if (state.duplication > 1) {
                        dropped = true;
                    }
                }
                else {
                    state.duplication = 0;
                    if (counter !== expected) {
                        dropped = true;
                    }
                }
                if (dropped === true) {
                    ++this.streamInfo[pid].drop;
                }
            }
            state.counter = counter;
        }
        this._continuityStateMap.set(pid, state);
    }
    _onPAT(pid, data) {
        this._tsid = data.transport_stream_id;
        this._serviceIds = new Set();
        this._parseServiceIds = new Set();
        for (const program of data.programs) {
            const serviceId = program.program_number;
            if (serviceId === 0) {
                const NIT_PID = program.network_PID;
                log.debug("TSFilter#_onPAT: detected NIT PID=%d", NIT_PID);
                if (this._parseNIT) {
                    this._parsePids.add(NIT_PID);
                }
                continue;
            }
            if ((this._targetNetworkId === 4 && serviceId === 929)) {
                const essPmtPid = program.program_map_PID;
                this._essMap.set(serviceId, essPmtPid);
                log.debug("TSFilter#_onPAT: detected ESS PMT PID=%d as serviceId=%d", essPmtPid, serviceId);
                continue;
            }
            this._serviceIds.add(serviceId);
            const item = this._targetNetworkId === null ? null : _1.default.service.get(this._targetNetworkId, serviceId);
            log.debug("TSFilter#_onPAT: detected PMT PID=%d as serviceId=%d (%s)", program.program_map_PID, serviceId, item ? item.name : "unregistered");
            if (serviceId === this._provideServiceId) {
                if (this._pmtPid !== program.program_map_PID) {
                    this._pmtPid = program.program_map_PID;
                    if (this._providePids.has(this._pmtPid) === false) {
                        this._providePids.add(this._pmtPid);
                    }
                    if (this._parsePids.has(this._pmtPid) === false) {
                        this._parsePids.add(this._pmtPid);
                    }
                    data._raw.copy(this._patsec, 0, 0, 8);
                    this._patsec[2] = 17;
                    this._patsec[8] = 0;
                    this._patsec[9] = 0;
                    this._patsec[10] = 224;
                    this._patsec[11] = 16;
                    this._patsec[12] = serviceId >> 8;
                    this._patsec[13] = serviceId & 255;
                    this._patsec[14] = (this._pmtPid >> 8) + 224;
                    this._patsec[15] = this._pmtPid & 255;
                    this._patsec.writeInt32BE(aribts_1.TsCrc32.calc(this._patsec.slice(0, 16)), 16);
                    this._patsec.fill(0xff, 20);
                }
            }
            if (this._parseEIT && item) {
                for (const service of _1.default.service.findByNetworkId(this._targetNetworkId)) {
                    if (this._parseServiceIds.has(service.serviceId) === false) {
                        this._parseServiceIds.add(service.serviceId);
                        log.debug("TSFilter#_onPAT: parsing serviceId=%d (%s)", service.serviceId, service.name);
                    }
                }
            }
        }
        if (this._parseSDT) {
            if (this._parsePids.has(0x11) === false) {
                this._parsePids.add(0x11);
            }
        }
    }
    _onPMT(pid, data) {
        if (this._essMap.has(data.program_number)) {
            for (const stream of data.streams) {
                for (const descriptor of stream.ES_info) {
                    if (descriptor.descriptor_tag === 0x52) {
                        if (descriptor.component_tag === 0x79 ||
                            descriptor.component_tag === 0x7A) {
                            this._parsePids.add(stream.elementary_PID);
                            this._essEsPids.add(stream.elementary_PID);
                            log.debug("TSFilter#_onPMT: detected ESS ES PID=%d", stream.elementary_PID);
                            break;
                        }
                    }
                }
            }
            this._parsePids.delete(pid);
            return;
        }
        if (this._ready === false && this._provideServiceId !== null && this._provideEventId === null) {
            this._ready = true;
            log.info("TSFilter#_onPMT: now ready for serviceId=%d", this._provideServiceId);
        }
        if (data.program_info[0]) {
            this._providePids.add(data.program_info[0].CA_PID);
        }
        this._providePids.add(data.PCR_PID);
        for (const stream of data.streams) {
            this._providePids.add(stream.elementary_PID);
        }
        if (this._parsePids.has(pid)) {
            this._parsePids.delete(pid);
            this._pmtTimer = setTimeout(() => {
                this._parsePids.add(pid);
            }, 1000);
        }
    }
    _onNIT(pid, data) {
        const _network = {
            networkId: data.network_id,
            areaCode: -1,
            remoteControlKeyId: -1
        };
        if (data.transport_streams[0]) {
            for (const desc of data.transport_streams[0].transport_descriptors) {
                switch (desc.descriptor_tag) {
                    case 0xFA:
                        _network.areaCode = desc.area_code;
                        break;
                    case 0xCD:
                        _network.remoteControlKeyId = desc.remote_control_key_id;
                        break;
                }
            }
        }
        this.emit("network", _network);
        if (this._parsePids.has(pid)) {
            this._parsePids.delete(pid);
        }
    }
    _onSDT(pid, data) {
        if (this._tsid !== data.transport_stream_id) {
            return;
        }
        const _services = [];
        for (const service of data.services) {
            if (this._serviceIds.has(service.service_id) === false) {
                continue;
            }
            let name = "";
            let type = -1;
            let logoId = -1;
            const m = service.descriptors.length;
            for (let j = 0; j < m; j++) {
                if (service.descriptors[j].descriptor_tag === 0x48) {
                    name = new aribts_1.TsChar(service.descriptors[j].service_name_char).decode();
                    type = service.descriptors[j].service_type;
                }
                if (service.descriptors[j].descriptor_tag === 0xCF) {
                    logoId = service.descriptors[j].logo_id;
                }
                if (name !== "" && logoId !== -1) {
                    break;
                }
            }
            if (_services.some(_service => _service.id === service.service_id) === false) {
                _services.push({
                    networkId: data.original_network_id,
                    serviceId: service.service_id,
                    name: name,
                    type: type,
                    logoId: logoId
                });
            }
        }
        this.emit("services", _services);
        if (this._parsePids.has(pid)) {
            this._parsePids.delete(pid);
        }
    }
    _onEIT(pid, data) {
        if (this._pmtPid !== -1 &&
            data.events.length !== 0 &&
            this._provideEventId !== null && data.table_id === 0x4E && data.section_number === 0 &&
            this._provideServiceId === data.service_id) {
            if (data.events[0].event_id === this._provideEventId) {
                this._provideEventLastDetectedAt = Date.now();
                if (this._ready === false) {
                    this._ready = true;
                    log.info("TSFilter#_onEIT: now ready for eventId=%d", this._provideEventId);
                }
            }
            else {
                if (this._ready) {
                    log.info("TSFilter#_onEIT: closing because eventId=%d has ended...", this._provideEventId);
                    const eventId = this._provideEventId;
                    this._provideEventId = null;
                    setTimeout(() => {
                        this._ready = false;
                        this._provideEventId = eventId;
                        this._close();
                    }, this._eventEndTimeout);
                }
            }
        }
        if (this._parseEIT &&
            this._parseServiceIds.has(data.service_id)) {
            if (!this._epg && status_1.default.epg[this._targetNetworkId] !== true) {
                status_1.default.epg[this._targetNetworkId] = true;
                this._epg = new EPG_1.default();
                this._standbyLogoData();
            }
            if (this._epg) {
                this._epg.write(data);
                if (!this._epgReady && data.table_id !== 0x4E && data.table_id !== 0x4F) {
                    this._updateEpgState(data);
                }
            }
        }
    }
    _onTOT(pid, data) {
        this._streamTime = (0, common_1.getTimeFromMJD)(data.JST_time);
    }
    _onCDT(pid, data) {
        if (data.data_type === 0x01) {
            const dataModule = new aribts_1.tsDataModule.TsDataModuleCdtLogo(data.data_module_byte).decode();
            if (dataModule.logo_type !== 0x05) {
                return;
            }
            log.debug("TSFilter#_onCDT: received logo data (networkId=%d, logoId=%d)", data.original_network_id, dataModule.logo_id);
            const logoData = aribts_1.TsLogo.decode(dataModule.data_byte);
            Service_1.default.saveLogoData(data.original_network_id, dataModule.logo_id, logoData);
        }
    }
    _onDSMCC(pid, data) {
        if (data.table_id === 0x3C) {
            const ddb = data.message;
            const downloadId = ddb.downloadId;
            const moduleId = ddb.moduleId;
            const dl = this._dlDataMap.get(downloadId);
            if (!dl || dl.moduleId !== moduleId || !dl.data) {
                return;
            }
            const moduleVersion = ddb.moduleVersion;
            if (dl.moduleVersion !== moduleVersion) {
                this._dlDataMap.delete(downloadId);
                return;
            }
            const blockNumber = ddb.blockNumber;
            const blockDataByte = ddb.blockDataByte;
            const blockOffset = dl.blockSize * blockNumber;
            if (dl.receivedBlocks.has(blockNumber)) {
                return;
            }
            if (blockOffset >= dl.moduleSize) {
                return;
            }
            blockDataByte.copy(dl.data, blockOffset);
            dl.loadedBytes += Math.min(blockDataByte.length, dl.moduleSize - blockOffset);
            dl.receivedBlocks.add(blockNumber);
            log.debug("TSFilter#_onDSMCC: detected DDB and logo data downloading... (downloadId=%d, %d/%d bytes)", downloadId, dl.loadedBytes, dl.moduleSize);
            if (dl.receivedBlocks.size < Math.ceil(dl.moduleSize / dl.blockSize)) {
                return;
            }
            const dlData = dl.data;
            this._dlDataMap.delete(downloadId);
            delete dl.data;
            const dataModule = new aribts_1.tsDataModule.TsDataModuleLogo(dlData).decode();
            for (const logo of dataModule.logos) {
                const logoData = new aribts_1.TsLogo(logo.data_byte).decode();
                const savedLogoDataKeys = new Set();
                for (const logoService of logo.services) {
                    const service = _1.default.service.get(logoService.original_network_id, logoService.service_id);
                    if (!service) {
                        continue;
                    }
                    service.logoId = logo.logo_id;
                    const logoDataKey = `${service.networkId}:${service.logoId}`;
                    if (savedLogoDataKeys.has(logoDataKey)) {
                        continue;
                    }
                    savedLogoDataKeys.add(logoDataKey);
                    log.debug("TSFilter#_onDSMCC: received logo data (networkId=%d, logoId=%d)", service.networkId, service.logoId);
                    Service_1.default.saveLogoData(service.networkId, service.logoId, logoData);
                }
            }
        }
        else if (data.table_id === 0x3B) {
            const dii = data.message;
            if (this._dlDataMap.has(dii.downloadId)) {
                return;
            }
            for (const module of dii.modules) {
                for (const descriptor of module.moduleInfo) {
                    if (descriptor.descriptor_tag !== 0x02) {
                        continue;
                    }
                    if (!LOGO_DATA_NAME_BS.equals(descriptor.text_char) &&
                        !LOGO_DATA_NAME_CS.equals(descriptor.text_char)) {
                        continue;
                    }
                    this._dlDataMap.set(dii.downloadId, {
                        downloadId: dii.downloadId,
                        blockSize: dii.blockSize || DSMCC_BLOCK_SIZE,
                        moduleId: module.moduleId,
                        moduleVersion: module.moduleVersion,
                        moduleSize: module.moduleSize,
                        loadedBytes: 0,
                        receivedBlocks: new Set(),
                        data: Buffer.allocUnsafeSlow(module.moduleSize).fill(0)
                    });
                    log.info("TSFilter#_onDSMCC: detected DII and buffer allocated for logo data (downloadId=%d, %d bytes)", dii.downloadId, module.moduleSize);
                    break;
                }
            }
        }
    }
    _observeProvideEvent() {
        if (Date.now() - this._provideEventLastDetectedAt < 10000) {
            this._provideEventTimeout = setTimeout(() => this._observeProvideEvent(), 3000);
            return;
        }
        log.warn("TSFilter#_observeProvideEvent: closing because EIT p/f timed out for eventId=%d...", this._provideEventId);
        this._close();
    }
    async _standbyLogoData() {
        if (this._closed) {
            return;
        }
        if (this._logoDataTimer) {
            return;
        }
        if (this._enableParseDSMCC && this._essMap.size === 0) {
            return;
        }
        const targetServices = [];
        if (this._enableParseDSMCC && this._targetNetworkId === 4) {
            targetServices.push(..._1.default.service.findByNetworkId(4), ..._1.default.service.findByNetworkId(6), ..._1.default.service.findByNetworkId(7));
        }
        else if (this._provideServiceId === null) {
            targetServices.push(..._1.default.service.findByNetworkId(this._targetNetworkId));
        }
        else if (this._enableParseCDT) {
            const service = _1.default.service.get(this._targetNetworkId, this._provideServiceId);
            if (service) {
                targetServices.push(service);
            }
        }
        const logoIdNetworkMap = {};
        for (const service of targetServices) {
            if (typeof service.logoId === "number") {
                if (!logoIdNetworkMap[service.networkId]) {
                    logoIdNetworkMap[service.networkId] = new Set();
                }
                logoIdNetworkMap[service.networkId].add(service.logoId);
            }
        }
        const now = Date.now();
        const logoDataInterval = _1.default.config.server.logoDataInterval || 1000 * 60 * 60 * 24 * 7;
        for (const networkId in logoIdNetworkMap) {
            const logoNetworkId = parseInt(networkId, 10);
            for (const logoId of logoIdNetworkMap[networkId]) {
                if (logoId === -1 && logoIdNetworkMap[networkId].size > 1) {
                    continue;
                }
                if (now - await Service_1.default.getLogoDataMTime(logoNetworkId, logoId) > logoDataInterval) {
                    if (this._closed) {
                        return;
                    }
                    if (this._enableParseCDT) {
                        if (logoId >= 0) {
                            this._parsePids.add(0x29);
                        }
                        this._parser.on("cdt", this._onCDT.bind(this));
                        this._logoDataTimer = setTimeout(() => {
                            this._parsePids.delete(0x29);
                            this._parser.removeAllListeners("cdt");
                            log.info("TSFilter#_standbyLogoData: stopped waiting for logo data (networkId=%d, logoId=%d)", this._targetNetworkId, logoId);
                        }, 1000 * 60 * 30);
                        log.info("TSFilter#_standbyLogoData: waiting for logo data for 30 minutes... (networkId=%d, logoId=%d)", this._targetNetworkId, logoId);
                    }
                    else if (this._enableParseDSMCC) {
                        for (const essPmtPid of this._essMap.values()) {
                            this._parsePids.add(essPmtPid);
                        }
                        this._parser.on("dsmcc", this._onDSMCC.bind(this));
                        this._logoDataTimer = setTimeout(() => {
                            delete this._logoDataTimer;
                            for (const essEsPid of this._essEsPids.values()) {
                                this._parsePids.delete(essEsPid);
                            }
                            this._parser.removeAllListeners("dsmcc");
                            log.info("TSFilter#_standbyLogoData: stopped waiting for logo data (networkId=[4,6,7])");
                        }, 1000 * 60 * 30);
                        log.info("TSFilter#_standbyLogoData: waiting for logo data for 30 minutes... (networkId=[4,6,7])");
                    }
                    return;
                }
            }
        }
    }
    _updateEpgState(data) {
        const networkId = data.original_network_id;
        const serviceId = data.service_id;
        const versionNumber = data.version_number;
        const stateByNet = this._epgState[networkId] || (this._epgState[networkId] = {});
        let stateBySrv = stateByNet[serviceId];
        if (!stateByNet[serviceId]) {
            stateBySrv = stateByNet[serviceId] = {
                basic: {
                    flags: [],
                    lastFlagsId: -1
                },
                extended: {
                    flags: [],
                    lastFlagsId: -1
                }
            };
            for (let i = 0; i < 0x08; i++) {
                for (const target of [stateBySrv.basic, stateBySrv.extended]) {
                    target.flags.push({
                        flag: Buffer.allocUnsafeSlow(32).fill(0x00),
                        ignore: Buffer.allocUnsafeSlow(32).fill(0xFF),
                        version_number: -1
                    });
                }
            }
        }
        const flagsId = data.table_id & 0x07;
        const lastFlagsId = data.last_table_id & 0x07;
        const segmentNumber = data.section_number >> 3;
        const lastSegmentNumber = data.last_section_number >> 3;
        const sectionNumber = data.section_number & 0x07;
        const segmentLastSectionNumber = data.segment_last_section_number & 0x07;
        const targetFlags = (data.table_id & 0x0F) < 0x08 ? stateBySrv.basic : stateBySrv.extended;
        const targetFlag = targetFlags.flags[flagsId];
        if ((targetFlags.lastFlagsId !== lastFlagsId) ||
            (targetFlag.version_number !== -1 && targetFlag.version_number !== versionNumber)) {
            if (targetFlag.version_number !== -1) {
                const verDiff = versionNumber - targetFlag.version_number;
                if (verDiff === -1 || verDiff > 1) {
                    return;
                }
            }
            for (let i = 0; i < 0x08; i++) {
                targetFlags.flags[i].flag.fill(0x00);
                targetFlags.flags[i].ignore.fill(i <= lastFlagsId ? 0x00 : 0xFF);
            }
        }
        if (flagsId === 0 && this._streamTime !== null) {
            const segment = (this._streamTime + 9 * 60 * 60 * 1000) / (3 * 60 * 60 * 1000) & 0x07;
            for (let i = 0; i < segment; i++) {
                targetFlag.ignore[i] = 0xFF;
            }
        }
        for (let i = lastSegmentNumber + 1; i < 0x20; i++) {
            targetFlag.ignore[i] = 0xFF;
        }
        for (let i = segmentLastSectionNumber + 1; i < 8; i++) {
            targetFlag.ignore[segmentNumber] |= 1 << i;
        }
        targetFlag.flag[segmentNumber] |= 1 << sectionNumber;
        targetFlags.lastFlagsId = lastFlagsId;
        targetFlag.version_number = versionNumber;
        let ready = true;
        isReady: for (const nid in this._epgState) {
            for (const sid in this._epgState[nid]) {
                for (const table of this._epgState[nid][sid].basic.flags.concat(this._epgState[nid][sid].extended.flags)) {
                    for (let i = 0; i < table.flag.length; i++) {
                        if ((table.flag[i] | table.ignore[i]) !== 0xFF) {
                            ready = false;
                            break isReady;
                        }
                    }
                }
            }
        }
        if (ready === true) {
            this._epgReady = true;
            this._clearEpgState();
            for (const service of _1.default.service.findByNetworkId(this._targetNetworkId)) {
                service.epgReady = true;
            }
            process.nextTick(() => this.emit("epgReady"));
        }
    }
    _clearEpgState() {
        if (!this._epgState) {
            return;
        }
        for (const nid in this._epgState) {
            delete this._epgState[nid];
        }
    }
    _close() {
        if (this._closed) {
            return;
        }
        this._closed = true;
        clearTimeout(this._pmtTimer);
        clearTimeout(this._provideEventTimeout);
        clearTimeout(this._logoDataTimer);
        setImmediate(() => {
            delete this._packet;
            delete this._buffer;
            delete this._patsec;
            delete this._patCRC;
        });
        this._parser.removeAllListeners();
        this._parser.end();
        delete this._parser;
        if (this._epg) {
            this._epg.end();
            delete this._epg;
            status_1.default.epg[this._targetNetworkId] = false;
            if (this._epgReady === true) {
                const now = Date.now();
                for (const service of _1.default.service.findByNetworkId(this._targetNetworkId)) {
                    service.epgUpdatedAt = now;
                }
            }
            this._clearEpgState();
            delete this._epgState;
        }
        if (this._output) {
            if (this._output.writableEnded === false) {
                this._output.end();
            }
            this._output.removeAllListeners();
            delete this._output;
        }
        delete this.streamInfo;
        delete this._continuityStateMap;
        --status_1.default.streamCount.tsFilter;
        log.info("TSFilter#_close: closed (serviceId=%s, eventId=%s)", this._provideServiceId, this._provideEventId);
        this.emit("close");
        this.emit("end");
    }
}
exports.default = TSFilter;
//# sourceMappingURL=TSFilter.js.map