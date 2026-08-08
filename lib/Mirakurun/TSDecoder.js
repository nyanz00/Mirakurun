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
const child_process = __importStar(require("child_process"));
const log = __importStar(require("./log"));
const status_1 = __importDefault(require("./status"));
let idCounter = 0;
class TSDecoder extends stream.Writable {
    static PROCESSING_LOG_PATTERN = /^processing:\s+-?\d+(?:\.\d+)?\s+MB\/sec$/;
    _output;
    _id;
    _command;
    _process;
    _readable;
    _writable;
    _isNew = false;
    _timeout;
    _closed = false;
    _deadCount = 0;
    constructor(opts) {
        super();
        this._id = idCounter++;
        this._command = opts.command;
        this._output = opts.output;
        this._output.once("finish", this._close.bind(this));
        this._output.once("close", this._close.bind(this));
        Object.defineProperty(this, "writableLength", {
            get() { return opts.output.writableLength; }
        });
        Object.defineProperty(this, "writableHighWaterMark", {
            get() { return opts.output.writableHighWaterMark; }
        });
        this.once("close", this._close.bind(this));
        log.info("TSDecoder#%d has created (command=%s)", this._id, this._command);
        ++status_1.default.streamCount.decoder;
        this._spawn();
    }
    _write(chunk, encoding, callback) {
        if (!this._writable) {
            callback();
            return;
        }
        if (this._isNew === true && this._process) {
            this._isNew = false;
            this._timeout = setTimeout(() => {
                log.warn("TSDecoder#%d process will force killed because no respond...", this._id);
                this._dead();
            }, 1500);
        }
        this._writable.write(chunk);
        callback();
    }
    _final() {
        this._close();
    }
    _spawn() {
        if (this._closed === true || this._process) {
            return;
        }
        if (this._deadCount > 0) {
            ++status_1.default.errorCount.decoderRespawn;
            log.warn("TSDecoder#%d respawning because dead (count=%d)", this._id, this._deadCount);
        }
        const proc = this._process = child_process.spawn(this._command);
        proc.once("close", (code, signal) => {
            log.info("TSDecoder#%d process has closed with exit code=%d by signal `%s` (pid=%d)", this._id, code, signal, proc.pid);
            this._dead();
        });
        proc.stderr.on("data", chunk => this._handleStderr(chunk));
        proc.stdout.once("data", () => clearTimeout(this._timeout));
        proc.stdout.on("data", chunk => this._output.write(chunk));
        this._readable = proc.stdout;
        this._writable = proc.stdin;
        this._isNew = true;
        log.info("TSDecoder#%d process has spawned by command `%s` (pid=%d)", this._id, this._command, proc.pid);
    }
    _handleStderr(chunk) {
        const text = chunk.toString();
        const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [];
        let passthrough = "";
        for (const line of lines) {
            if (line.length === 0) {
                continue;
            }
            const trimmed = line.trim();
            if (TSDecoder.PROCESSING_LOG_PATTERN.test(trimmed)) {
                log.debug("TSDecoder#%d > %s", this._id, trimmed);
            }
            else {
                passthrough += line;
            }
        }
        if (passthrough.length > 0) {
            process.stderr.write(passthrough);
        }
    }
    _dead() {
        if (this._closed === true) {
            return;
        }
        log.error("TSDecoder#%d unexpected dead", this._id);
        ++this._deadCount;
        this._kill();
        if (this._deadCount > 3) {
            this._fallback();
            return;
        }
        setTimeout(() => this._spawn(), 1500);
    }
    _fallback() {
        const passThrough = new stream.PassThrough({ allowHalfOpen: false });
        passThrough.on("data", chunk => this._output.write(chunk));
        this._readable = passThrough;
        this._writable = passThrough;
        log.warn("TSDecoder#%d has been fallback into pass-through stream", this._id);
    }
    _kill() {
        if (this._process) {
            this._process.kill("SIGKILL");
            delete this._process;
        }
        if (this._readable) {
            this._readable.destroy();
            delete this._readable;
        }
        if (this._writable) {
            this._writable.destroy();
            delete this._writable;
        }
    }
    _close() {
        if (this._closed === true) {
            return;
        }
        this._closed = true;
        this._kill();
        if (this._output.writableEnded === false) {
            this._output.end();
        }
        this._output.removeAllListeners();
        delete this._output;
        --status_1.default.streamCount.decoder;
        log.info("TSDecoder#%d has closed (command=%s)", this._id, this._command);
        this.emit("close");
        this.emit("end");
    }
}
exports.default = TSDecoder;
//# sourceMappingURL=TSDecoder.js.map