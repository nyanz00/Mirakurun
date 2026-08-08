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
const stream = __importStar(require("stream"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
if (process.argv.length < 3) {
    console.error("Mirakurun EPG Dump Test Program");
    console.error("Usage: mirakurun-epgdump [-f] src.ts dest.json");
    process.exit(1);
}
const force = process.argv[process.argv.length - 3] === "-f";
const src = path.resolve(process.cwd(), process.argv[process.argv.length - 2]);
const dest = path.resolve(process.cwd(), process.argv[process.argv.length - 1]);
console.log("src:", src);
console.log("dest:", dest);
if (fs.existsSync(src) === false) {
    console.error(`"${src}" is not exists.`);
    process.exit(1);
}
if (fs.existsSync(dest) === true && force === false) {
    console.error(`"${dest}" is exists.`);
    process.exit(1);
}
process.env.SERVER_CONFIG_PATH = path.resolve(__dirname, "../config/server.yml");
process.env.PROGRAMS_DB_PATH = dest;
const aribts_1 = require("@chinachu/aribts");
const _1 = __importDefault(require("./Mirakurun/_"));
const Event_1 = __importDefault(require("./Mirakurun/Event"));
const Program_1 = __importDefault(require("./Mirakurun/Program"));
const EPG_1 = __importDefault(require("./Mirakurun/EPG"));
const log = __importStar(require("./Mirakurun/log"));
log.logLevel = log.LogLevel.INFO;
_1.default.event = new Event_1.default();
_1.default.program = new Program_1.default();
const epg = new EPG_1.default();
const size = fs.statSync(src).size;
let bytesRead = 0;
let events = 0;
const tsStream = new aribts_1.TsStream();
const readStream = fs.createReadStream(src);
const transformStream = new stream.Transform({
    transform: function (chunk, encoding, done) {
        bytesRead += chunk.length;
        console.log("\u001b[2A");
        console.log(`reading - ${bytesRead} of ${size} [${Math.floor(bytesRead / size * 100)}%] (events=${events})`);
        this.push(chunk);
        done();
    },
    flush: done => {
        console.log("\u001b[2A");
        console.log(`reading - ${bytesRead} of ${size} [${Math.floor(bytesRead / size * 100)}%] (events=${events}) [done]`);
        console.timeEnd("read");
        setTimeout(finalize, 3500);
        done();
    }
});
console.log("");
console.time("read");
readStream.pipe(transformStream);
transformStream.pipe(tsStream);
tsStream.on("eit", (pid, data) => {
    epg.write(data);
    events = _1.default.program.itemMap.size;
});
tsStream.resume();
function finalize() {
    const programs = Array.from(_1.default.program.itemMap.values());
    console.log("programs:", programs.length, "(events)");
    fs.writeFileSync(dest, JSON.stringify(programs, null, "  "));
    console.log(`saved to "${dest}".`);
    process.exit(0);
}
//# sourceMappingURL=epgdump.js.map