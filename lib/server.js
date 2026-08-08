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
Buffer.poolSize = 0;
require("dotenv").config();
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const isWindows = process.platform === "win32";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
if (process.platform !== "linux" && !isWindows) {
    console.warn("running in not linux!");
}
if (!isWindows && isRoot) {
    try {
        (0, child_process_1.execSync)(`renice -n -10 -p ${process.pid}`);
        (0, child_process_1.execSync)(`ionice -c 1 -n 7 -p ${process.pid}`);
    }
    catch (e) {
        console.warn("error on modify nice: " + e.message);
    }
}
else if (!isWindows) {
    console.warn("running in not root!");
}
process.title = "Mirakurun: Server";
process.on("uncaughtException", err => {
    ++status_1.default.errorCount.uncaughtException;
    console.error(err.stack);
});
process.on("unhandledRejection", err => {
    ++status_1.default.errorCount.unhandledRejection;
    console.error(err);
});
function setEnv(name, value) {
    process.env[name] = process.env[name] || value;
}
function setWindowsPortableEnv() {
    const rootDir = (0, path_1.resolve)(__dirname, "..");
    const configDir = (0, path_1.join)(rootDir, "data", "config");
    const dataDir = (0, path_1.join)(rootDir, "data", "db");
    const logDir = (0, path_1.join)(rootDir, "data", "log");
    ensureWindowsPortableData(configDir, dataDir, logDir);
    setEnv("SERVER_CONFIG_PATH", (0, path_1.join)(configDir, "server.yml"));
    setEnv("TUNERS_CONFIG_PATH", (0, path_1.join)(configDir, "tuners.yml"));
    setEnv("CHANNELS_CONFIG_PATH", (0, path_1.join)(configDir, "channels.yml"));
    setEnv("SERVICES_DB_PATH", (0, path_1.join)(dataDir, "services.json"));
    setEnv("PROGRAMS_DB_PATH", (0, path_1.join)(dataDir, "programs.json"));
    setEnv("LOGO_DATA_DIR_PATH", (0, path_1.join)(dataDir, "logo-data"));
    setEnv("LOGO_MAP_PATH", (0, path_1.join)(dataDir, "logo-map.json"));
    setEnv("MIRAKURUN_PLATFORM", "win32");
    setupCliLogFiles(logDir);
}
function ensureWindowsPortableData(configDir, dataDir, logDir) {
    ensureDirectory(configDir, "config");
    ensureDirectory(dataDir, "db");
    ensureDirectory(logDir, "log");
}
function ensureDirectory(path, name) {
    if ((0, fs_1.existsSync)(path) === true) {
        if ((0, fs_1.statSync)(path).isDirectory() === false) {
            console.error(`Windows portable ${name} path exists but is not a directory: ${path}`);
            process.exit(1);
        }
        return;
    }
    (0, fs_1.mkdirSync)(path, { recursive: true });
}
function setupCliLogFiles(logDir) {
    if (process.env.USING_WINSER === "1" || process.env.MIRAKURUN_CLI_LOG === "0") {
        return;
    }
    if ((0, fs_1.existsSync)(logDir) === false) {
        (0, fs_1.mkdirSync)(logDir, { recursive: true });
    }
    const stdout = (0, fs_1.createWriteStream)((0, path_1.join)(logDir, "stdout.log"), { flags: "a" });
    const stderr = (0, fs_1.createWriteStream)((0, path_1.join)(logDir, "stderr.log"), { flags: "a" });
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    stdout.on("error", () => undefined);
    stderr.on("error", () => undefined);
    process.stdout.write = ((chunk, encoding, callback) => {
        stdout.write(chunk, encoding);
        return originalStdoutWrite(chunk, encoding, callback);
    });
    process.stderr.write = ((chunk, encoding, callback) => {
        stderr.write(chunk, encoding);
        return originalStderrWrite(chunk, encoding, callback);
    });
}
if (isWindows) {
    setWindowsPortableEnv();
}
else {
    setEnv("SERVER_CONFIG_PATH", "/usr/local/etc/mirakurun/server.yml");
    setEnv("TUNERS_CONFIG_PATH", "/usr/local/etc/mirakurun/tuners.yml");
    setEnv("CHANNELS_CONFIG_PATH", "/usr/local/etc/mirakurun/channels.yml");
    setEnv("SERVICES_DB_PATH", "/usr/local/var/db/mirakurun/services.json");
    setEnv("PROGRAMS_DB_PATH", "/usr/local/var/db/mirakurun/programs.json");
    setEnv("LOGO_DATA_DIR_PATH", "/usr/local/var/db/mirakurun/logo-data");
    setEnv("LOGO_MAP_PATH", "/usr/local/var/db/mirakurun/logo-map.json");
}
const _1 = __importDefault(require("./Mirakurun/_"));
const status_1 = __importDefault(require("./Mirakurun/status"));
const Event_1 = __importDefault(require("./Mirakurun/Event"));
const Job_1 = __importDefault(require("./Mirakurun/Job"));
const Tuner_1 = __importDefault(require("./Mirakurun/Tuner"));
const Channel_1 = __importDefault(require("./Mirakurun/Channel"));
const Service_1 = __importDefault(require("./Mirakurun/Service"));
const Program_1 = __importDefault(require("./Mirakurun/Program"));
const Server_1 = __importDefault(require("./Mirakurun/Server"));
const config = __importStar(require("./Mirakurun/config"));
const log = __importStar(require("./Mirakurun/log"));
(async function top() {
    _1.default.config.server = await config.loadServer();
    _1.default.config.channels = await config.loadChannels();
    _1.default.configIntegrity.channels = (0, crypto_1.createHash)("sha256").update(JSON.stringify(_1.default.config.channels)).digest("base64");
    _1.default.config.tuners = await config.loadTuners();
    if (typeof _1.default.config.server.logLevel === "number") {
        log.logLevel = _1.default.config.server.logLevel;
    }
    if (typeof _1.default.config.server.maxLogHistory === "number") {
        log.maxLogHistory = _1.default.config.server.maxLogHistory;
    }
    _1.default.event = new Event_1.default();
    _1.default.job = new Job_1.default();
    _1.default.tuner = new Tuner_1.default();
    _1.default.channel = new Channel_1.default();
    _1.default.service = new Service_1.default();
    _1.default.program = new Program_1.default();
    _1.default.server = new Server_1.default();
    await _1.default.service.load();
    await _1.default.program.load();
    if (process.env.SETUP === "true") {
        log.info("setup is done.");
        process.exit(0);
    }
    _1.default.server.init();
})();
//# sourceMappingURL=server.js.map