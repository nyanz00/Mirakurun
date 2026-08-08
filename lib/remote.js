"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = __importDefault(require("./client"));
process.title = "Mirakurun: Remote";
process.stdin.resume();
process.stdin.on("data", () => exit());
process.on("SIGTERM", () => exit());
const opt = {
    host: process.argv[2],
    port: parseInt(process.argv[3], 10),
    type: process.argv[4],
    channel: process.argv[5],
    decode: process.argv.includes("decode") === true
};
console.error("remote:", opt);
let stream;
let reconnectTimer;
let exiting = false;
const client = new client_1.default();
client.host = opt.host;
client.port = opt.port;
client.userAgent = "Mirakurun (Remote)";
connect();
function connect() {
    client.getChannelStream(opt.type, opt.channel, opt.decode)
        .then(_stream => {
        stream = _stream;
        stream.pipe(process.stdout);
        stream.once("end", () => reconnect("end"));
        stream.once("close", () => reconnect("close"));
        stream.once("aborted", () => reconnect("aborted"));
        stream.once("error", err => {
            console.error("remote:", "(stream error)", err.message);
            reconnect("error");
        });
    })
        .catch(err => {
        if (err.req) {
            console.error("remote:", "(error)", err.req.path, err.statusCode, err.statusMessage);
        }
        else if (err.message) {
            console.error("remote:", "(error)", err.message);
        }
        else {
            console.error("remote:", "(error)", err.address, err.code);
        }
        reconnect("connect");
    });
}
function reconnect(reason) {
    if (exiting) {
        return;
    }
    console.error("remote:", "reconnect.", reason);
    if (stream) {
        stream.unpipe();
        stream.removeAllListeners();
        stream.destroy();
        stream = null;
    }
    if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, 3000);
    }
}
function exit(code = 0) {
    if (exiting) {
        return;
    }
    exiting = true;
    console.error("remote:", "exit.");
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (stream) {
        stream.unpipe();
        stream.destroy();
    }
    process.exit(code);
}
//# sourceMappingURL=remote.js.map