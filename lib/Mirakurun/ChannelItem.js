"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = __importDefault(require("./_"));
class ChannelItem {
    name;
    type;
    channel;
    tsmfRelTs;
    commandVars;
    constructor(config) {
        this.name = config.name;
        this.type = config.type;
        this.channel = config.channel;
        this.tsmfRelTs = config.tsmfRelTs;
        this.commandVars = config.commandVars;
    }
    getServices() {
        return _1.default.service.findByChannel(this);
    }
    getStream(user, output) {
        return _1.default.tuner.initChannelStream(this, user, output);
    }
}
exports.default = ChannelItem;
//# sourceMappingURL=ChannelItem.js.map