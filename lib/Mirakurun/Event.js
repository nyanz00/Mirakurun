"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Event = void 0;
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const common_1 = require("./common");
const _1 = __importDefault(require("./_"));
class Event extends eventemitter3_1.default {
    static get log() {
        return _1.default.event.log;
    }
    static onEvent(listener) {
        _1.default.event.on("event", listener);
    }
    static onceEvent(listener) {
        _1.default.event.once("event", listener);
    }
    static removeListener(listener) {
        _1.default.event.removeListener("event", listener);
    }
    static emit(resource, type, data) {
        const message = {
            resource: resource,
            type: type,
            data: (0, common_1.deepClone)(data),
            time: Date.now()
        };
        return _1.default.event.emit("event", message);
    }
    _log = [];
    constructor() {
        super();
        this.on("event", message => {
            this._log.push(message);
            if (this._log.length > 100) {
                this._log.shift();
            }
        });
    }
    get log() {
        return this._log;
    }
}
exports.Event = Event;
exports.default = Event;
//# sourceMappingURL=Event.js.map