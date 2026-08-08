"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const status = {
    epg: {},
    rpcCount: 0,
    streamCount: {
        tsFilter: 0,
        decoder: 0
    },
    errorCount: {
        uncaughtException: 0,
        unhandledRejection: 0,
        bufferOverflow: 0,
        tunerDeviceRespawn: 0,
        decoderRespawn: 0
    },
    timerAccuracy: {
        last: 0,
        m1: Array.apply(null, new Array(60)).map(Number.prototype.valueOf, 0),
        m5: Array.apply(null, new Array(60 * 5)).map(Number.prototype.valueOf, 0),
        m15: Array.apply(null, new Array(60 * 15)).map(Number.prototype.valueOf, 0)
    }
};
const tl = status.timerAccuracy;
let last;
function tick() {
    const diff = process.hrtime(last);
    tl.last = diff[0] * 1e9 + diff[1] - 1000000000;
    tl.m1.push(tl.last);
    tl.m5.push(tl.last);
    tl.m15.push(tl.last);
    tl.m1.shift();
    tl.m5.shift();
    tl.m15.shift();
    last = process.hrtime();
    setTimeout(tick, 1000);
}
setTimeout(() => last = process.hrtime(), 1000 * 9);
setTimeout(tick, 1000 * 10);
exports.default = status;
//# sourceMappingURL=status.js.map