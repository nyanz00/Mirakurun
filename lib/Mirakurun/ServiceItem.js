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
const common = __importStar(require("./common"));
const _1 = __importDefault(require("./_"));
const Event_1 = __importDefault(require("./Event"));
class ServiceItem {
    _channel;
    _networkId;
    _serviceId;
    _name;
    _type;
    _logoId;
    _remoteControlKeyId;
    _epgReady;
    _epgUpdatedAt;
    static getId(networkId, serviceId) {
        return parseInt(networkId + (serviceId / 100000).toFixed(5).slice(2), 10);
    }
    _id;
    constructor(_channel, _networkId, _serviceId, _name, _type, _logoId, _remoteControlKeyId, _epgReady = false, _epgUpdatedAt = 0) {
        this._channel = _channel;
        this._networkId = _networkId;
        this._serviceId = _serviceId;
        this._name = _name;
        this._type = _type;
        this._logoId = _logoId;
        this._remoteControlKeyId = _remoteControlKeyId;
        this._epgReady = _epgReady;
        this._epgUpdatedAt = _epgUpdatedAt;
        this._id = ServiceItem.getId(_networkId, _serviceId);
    }
    get id() {
        return this._id;
    }
    get networkId() {
        return this._networkId;
    }
    get serviceId() {
        return this._serviceId;
    }
    get name() {
        return this._name || "";
    }
    set name(name) {
        if (this._name !== name) {
            this._name = name;
            _1.default.service.save();
            this._updated();
        }
    }
    get type() {
        return this._type;
    }
    set type(type) {
        if (this._type !== type) {
            this._type = type;
            _1.default.service.save();
            this._updated();
        }
    }
    get logoId() {
        return this._logoId;
    }
    set logoId(logoId) {
        if (this._logoId !== logoId) {
            this._logoId = logoId;
            _1.default.service.save();
            this._updated();
        }
    }
    get remoteControlKeyId() {
        return this._remoteControlKeyId;
    }
    set remoteControlKeyId(id) {
        if (this._remoteControlKeyId !== id) {
            this._remoteControlKeyId = id;
            _1.default.service.save();
            this._updated();
        }
    }
    get epgReady() {
        return this._epgReady;
    }
    set epgReady(epgReady) {
        if (this._epgReady !== epgReady) {
            this._epgReady = epgReady;
            _1.default.service.save();
            this._updated();
        }
    }
    get epgUpdatedAt() {
        return this._epgUpdatedAt;
    }
    set epgUpdatedAt(time) {
        if (this._epgUpdatedAt !== time) {
            this._epgUpdatedAt = time;
            _1.default.service.save();
            this._updated();
        }
    }
    get channel() {
        return this._channel;
    }
    export() {
        const ret = {
            id: this._id,
            serviceId: this._serviceId,
            networkId: this._networkId,
            name: this._name || "",
            type: this._type,
            logoId: this._logoId,
            remoteControlKeyId: this._remoteControlKeyId,
            epgReady: this._epgReady,
            epgUpdatedAt: this._epgUpdatedAt,
            channel: {
                type: this._channel.type,
                channel: this._channel.channel
            }
        };
        return ret;
    }
    getStream(userRequest, output) {
        return _1.default.tuner.initServiceStream(this, userRequest, output);
    }
    getOrder() {
        let order;
        switch (common.getTuningChannelType(this._channel.type)) {
            case "GR":
                order = "1";
                break;
            case "BS":
                order = "2";
                break;
            case "CS":
                order = "3";
                break;
            case "SKY":
                order = "4";
                break;
        }
        if (this._remoteControlKeyId) {
            order += (100 + this._remoteControlKeyId).toString(10);
        }
        else {
            order += "200";
        }
        order += (10000 + this._serviceId).toString(10);
        return parseInt(order, 10);
    }
    _updated() {
        Event_1.default.emit("service", "update", this.export());
    }
}
exports.default = ServiceItem;
//# sourceMappingURL=ServiceItem.js.map