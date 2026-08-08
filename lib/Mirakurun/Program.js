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
exports.Program = void 0;
exports.getProgramItemId = getProgramItemId;
const sift_1 = __importDefault(require("sift"));
const common = __importStar(require("./common"));
const log = __importStar(require("./log"));
const db = __importStar(require("./db"));
const _1 = __importDefault(require("./_"));
const Event_1 = __importDefault(require("./Event"));
function getProgramItemId(networkId, serviceId, eventId) {
    return parseInt(`${networkId}${serviceId.toString(10).padStart(5, "0")}${eventId.toString(10).padStart(5, "0")}`, 10);
}
class Program {
    _itemMap = new Map();
    _itemMapDeleted = new Map();
    _saveTimerId;
    _emitTimerId;
    _emitRunning = false;
    _emitPrograms = new Map();
    constructor() {
        const gcJob = {
            key: "Program.GC",
            name: "Program GC",
            fn: () => this._gc()
        };
        _1.default.job.add({
            ...gcJob,
            readyFn: async () => {
                await common.sleep(1000 * 5);
                return true;
            }
        });
        _1.default.job.addSchedule({
            key: "Program.GC",
            schedule: _1.default.config.server.programGCJobSchedule || "45 * * * *",
            job: gcJob
        });
    }
    get itemMap() {
        return this._itemMap;
    }
    add(item, firstAdd = false) {
        if (this.exists(item.id)) {
            return;
        }
        this._itemMapDeleted.delete(item.id);
        if (firstAdd === false) {
            this._findAndRemoveConflicts(item);
        }
        this._itemMap.set(item.id, item);
        if (firstAdd === false) {
            this._emitPrograms.set(item, "create");
        }
        this.save();
    }
    get(id) {
        return this._itemMap.get(id) || null;
    }
    set(id, props) {
        let item = this.get(id);
        if (!item) {
            item = this._itemMapDeleted.get(id) || null;
            if (item) {
                this._itemMap.set(item.id, item);
                this._itemMapDeleted.delete(item.id);
                this._emitPrograms.set(item, "create");
                this.save();
                log.debug("ProgramItem#%d (networkId=%d, serviceId=%d, eventId=%d) has recovered from the logically-deleted store", item.id, item.networkId, item.serviceId, item.eventId);
            }
        }
        if (item && common.updateObject(item, props) === true) {
            if (props.startAt || props.duration) {
                this._findAndRemoveConflicts(item);
            }
            this._emitPrograms.set(item, "update");
            this.save();
        }
    }
    remove(id, logicallyDelete = false) {
        if (logicallyDelete) {
            const item = this.get(id);
            if (item) {
                this._itemMapDeleted.set(item.id, item);
                this._itemMap.delete(id);
                this.save();
            }
        }
        else {
            if (this._itemMap.delete(id)) {
                this.save();
            }
        }
    }
    exists(id) {
        return this._itemMap.has(id);
    }
    isLogicallyDeleted(id) {
        return this._itemMapDeleted.has(id);
    }
    findByQuery(query) {
        return Array.from(this._itemMap.values()).filter((0, sift_1.default)(query));
    }
    findByNetworkId(networkId) {
        const items = [];
        for (const item of this._itemMap.values()) {
            if (item.networkId === networkId) {
                items.push(item);
            }
        }
        return items;
    }
    findByNetworkIdAndTime(networkId, time) {
        const items = [];
        for (const item of this._itemMap.values()) {
            if (item.networkId === networkId && item.startAt <= time && item.startAt + item.duration > time) {
                items.push(item);
            }
        }
        return items;
    }
    findByNetworkIdAndReplace(networkId, programs, emitEvents = false) {
        let count = 0;
        if (emitEvents === true) {
            const incomingIds = new Set(programs.map(program => program.id));
            for (const item of [...this._itemMap.values()].reverse()) {
                if (item.networkId === networkId && incomingIds.has(item.id) === false) {
                    this.remove(item.id);
                    Event_1.default.emit("program", "remove", { id: item.id });
                    --count;
                }
            }
            for (const program of programs) {
                const item = this.get(program.id);
                if (item) {
                    if (common.updateObject(item, program) === true) {
                        this._emitPrograms.set(item, "update");
                    }
                }
                else {
                    this.add(program);
                }
                ++count;
            }
            log.debug("programs replaced (networkId=%d, count=%d, emitEvents=true)", networkId, count);
            this.save();
            return;
        }
        for (const item of [...this._itemMap.values()].reverse()) {
            if (item.networkId === networkId) {
                this.remove(item.id);
                --count;
            }
        }
        for (const program of programs) {
            this.add(program, true);
            ++count;
        }
        log.debug("programs replaced (networkId=%d, count=%d)", networkId, count);
        this.save();
    }
    save() {
        clearTimeout(this._emitTimerId);
        this._emitTimerId = setTimeout(() => this._emit(), 1000);
        clearTimeout(this._saveTimerId);
        this._saveTimerId = setTimeout(() => this._save(), 1000 * 30);
    }
    async load() {
        log.debug("loading programs...");
        const now = Date.now();
        let dropped = false;
        const programs = await db.loadPrograms(_1.default.configIntegrity.channels, true);
        programs.forEach(item => {
            if (item.networkId === undefined) {
                dropped = true;
                return;
            }
            if (now > (item.startAt + item.duration)) {
                dropped = true;
                return;
            }
            this.add(item, true);
        });
        if (dropped) {
            this.save();
        }
    }
    _findAndRemoveConflicts(added) {
        const addedEndAt = added.startAt + added.duration;
        for (const item of this._itemMap.values()) {
            if (item.networkId === added.networkId &&
                item.serviceId === added.serviceId &&
                item.id !== added.id) {
                const itemEndAt = item.startAt + item.duration;
                if (((added.startAt <= item.startAt && item.startAt < addedEndAt) ||
                    (item.startAt <= added.startAt && added.startAt < itemEndAt)) &&
                    (!(item._isPresent || item._isFollowing) || added._isPresent)) {
                    this.remove(item.id, true);
                    Event_1.default.emit("program", "remove", { id: item.id });
                    log.debug("ProgramItem#%d (networkId=%d, serviceId=%d, eventId=%d) has removed by overlapped ProgramItem#%d (eventId=%d)", item.id, item.networkId, item.serviceId, item.eventId, added.id, added.eventId);
                }
            }
        }
    }
    async _emit() {
        if (this._emitRunning) {
            return;
        }
        this._emitRunning = true;
        for (const [item, eventType] of this._emitPrograms) {
            this._emitPrograms.delete(item);
            Event_1.default.emit("program", eventType, item);
            await common.sleep(10);
        }
        this._emitRunning = false;
        if (this._emitPrograms.size > 0) {
            this._emit();
        }
    }
    _save() {
        log.debug("saving programs...");
        db.savePrograms(Array.from(this._itemMap.values()), _1.default.configIntegrity.channels);
    }
    async _gc() {
        log.debug("Program GC has started");
        const shortExp = Date.now() - 1000 * 60 * 60 * 3;
        const longExp = Date.now() - 1000 * 60 * 60 * 24;
        const maximum = Date.now() + 1000 * 60 * 60 * 24 * 9;
        let count = 0;
        for (const item of this._itemMap.values()) {
            if ((item.duration === 1 ? longExp : shortExp) > (item.startAt + item.duration) ||
                maximum < item.startAt) {
                ++count;
                this.remove(item.id);
            }
        }
        for (const item of this._itemMapDeleted.values()) {
            if ((item.duration === 1 ? longExp : shortExp) > (item.startAt + item.duration) ||
                maximum < item.startAt) {
                ++count;
                this._itemMapDeleted.delete(item.id);
            }
        }
        log.info("Program GC has finished and removed %d programs", count);
    }
}
exports.Program = Program;
exports.default = Program;
//# sourceMappingURL=Program.js.map