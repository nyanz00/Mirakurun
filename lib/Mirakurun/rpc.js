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
exports.createRPCServer = createRPCServer;
exports.initRPCNotifier = initRPCNotifier;
const server_1 = __importDefault(require("jsonrpc2-ws/lib/server"));
const log = __importStar(require("./log"));
const _1 = __importDefault(require("./_"));
const status_1 = __importDefault(require("./status"));
const Event_1 = __importDefault(require("./Event"));
const Service_1 = require("./Service");
const log_1 = require("./log");
const system_1 = require("./system");
const common_1 = require("./common");
const status_2 = require("./api/status");
function createRPCServer(server) {
    const rpc = new server_1.default({
        pingInterval: 1000 * 30,
        wss: {
            path: "/rpc",
            perMessageDeflate: false,
            clientTracking: false,
            noServer: true
        }
    });
    server.on("upgrade", serverOnUpgrade.bind(rpc.wss));
    rpc.on("connection", rpcConnection);
    rpc.methods.set("join", onJoin);
    rpc.methods.set("leave", onLeave);
    rpc.methods.set("getStatus", status_2.getStatus);
    rpc.methods.set("getServices", getServices);
    rpc.methods.set("getTuners", getTuners);
    rpc.methods.set("getJobs", getJobs);
    rpc.methods.set("getJobSchedules", getJobSchedules);
    return rpc;
}
const _notifierListeners = new Map();
function initRPCNotifier(rpcs) {
    const eventsNMDict = {
        program: new NotifyManager("events:program", "events", rpcs),
        service: new NotifyManager("events:service", "events", rpcs),
        tuner: new NotifyManager("events:tuner", "events", rpcs),
        job: new NotifyManager("events:job", "events", rpcs),
        job_schedule: new NotifyManager("events:job_schedule", "events", rpcs)
    };
    function onEventListener(event) {
        eventsNMDict[event.resource].notify(event);
    }
    const logsNM = new NotifyManager("logs", "logs", rpcs);
    function onLogDataListener(log) {
        logsNM.notify(log);
    }
    Event_1.default.onEvent(onEventListener);
    log_1.event.on("data", onLogDataListener);
    _notifierListeners.set(rpcs, [
        onEventListener,
        onLogDataListener
    ]);
}
class NotifyManager {
    _room;
    _method;
    _rpcs;
    _items = new Set();
    _active = false;
    constructor(_room, _method, _rpcs) {
        this._room = _room;
        this._method = _method;
        this._rpcs = _rpcs;
    }
    async notify(item) {
        this._items.add(item);
        if (this._active) {
            return;
        }
        this._active = true;
        await (0, common_1.sleep)(8);
        if (status_1.default.rpcCount > 0) {
            const params = {
                array: [...this._items.values()]
            };
            for (const rpc of this._rpcs) {
                if (rpc.sockets.size > 0) {
                    rpc.notifyTo(this._room, this._method, params);
                }
            }
        }
        this._items.clear();
        this._active = false;
    }
}
function serverOnUpgrade(req, socket, head) {
    if (req.socket.remoteAddress && !(0, system_1.isPermittedIPAddress)(req.socket.remoteAddress)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
    }
    if (req.headers.origin !== undefined) {
        if (!(0, system_1.isPermittedHost)(req.headers.origin, _1.default.config.server.hostname) && !_1.default.config.server.allowOrigins.includes(req.headers.origin)) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
        }
    }
    this.handleUpgrade(req, socket, head, ws => this.emit("connection", ws, req));
}
function rpcConnection(socket, req) {
    ++status_1.default.rpcCount;
    const ip = req.socket.remoteAddress || "unix";
    const ua = "" + req.headers["user-agent"];
    socket.data.set("ip", ip);
    socket.data.set("ua", ua);
    socket.ws.on("error", wsError);
    socket.on("close", socketClose);
    log.info(`${ip} - RPC #${socket.id} connected - - ${ua}`);
}
function wsError(err) {
    log.error(JSON.stringify(err, null, "  "));
    console.error(err.stack);
}
function socketClose() {
    --status_1.default.rpcCount;
    log.info(`${this.data.get("ip")} - RPC #${this.id} closed - ${this.data.get("ua")}`);
}
function onJoin(socket, params) {
    for (const room of params.rooms) {
        socket.joinTo(room);
    }
}
function onLeave(socket, params) {
    for (const room of params.rooms) {
        socket.leaveFrom(room);
    }
}
async function getServices() {
    const serviceItems = [..._1.default.service.items];
    serviceItems.sort((a, b) => a.getOrder() - b.getOrder());
    const services = [];
    for (const serviceItem of serviceItems) {
        const hasLogoData = await Service_1.Service.isLogoDataExists(serviceItem.networkId, serviceItem.logoId) ||
            await _1.default.tuner.hasRemoteLogoData(serviceItem);
        services.push({
            ...serviceItem.export(),
            hasLogoData
        });
    }
    return services;
}
function getTuners() {
    return _1.default.tuner.devices;
}
function getJobs() {
    return _1.default.job.jobs;
}
function getJobSchedules() {
    return _1.default.job.schedules;
}
//# sourceMappingURL=rpc.js.map