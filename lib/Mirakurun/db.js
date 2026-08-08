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
exports.loadServices = loadServices;
exports.saveServices = saveServices;
exports.loadPrograms = loadPrograms;
exports.savePrograms = savePrograms;
const path_1 = require("path");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const util_1 = require("util");
const yieldableJSON = __importStar(require("yieldable-json"));
const parseAsync = (0, util_1.promisify)(yieldableJSON.parseAsync);
const promise_queue_1 = __importDefault(require("promise-queue"));
const log = __importStar(require("./log"));
async function loadServices(integrity, sync = false) {
    return load(process.env.SERVICES_DB_PATH, integrity, sync);
}
async function saveServices(data, integrity) {
    return save(process.env.SERVICES_DB_PATH, data, integrity);
}
async function loadPrograms(integrity, sync = false) {
    return load(process.env.PROGRAMS_DB_PATH, integrity, sync);
}
async function savePrograms(data, integrity) {
    return save(process.env.PROGRAMS_DB_PATH, data, integrity);
}
const dbIOQueue = new promise_queue_1.default(1, Infinity);
async function load(path, integrity, sync = false) {
    log.info("load db `%s` w/ integrity (%s)", path, integrity);
    return dbIOQueue.add(async () => {
        if ((0, fs_1.existsSync)(path) === false) {
            log.info("db `%s` is not exists", path);
            return [];
        }
        const json = sync ? (0, fs_1.readFileSync)(path, "utf8") : await (0, promises_1.readFile)(path, "utf8");
        try {
            const array = sync ? JSON.parse(json) : await parseAsync(json);
            if (array.length > 0 && array[0].__integrity__) {
                if (integrity === array[0].__integrity__) {
                    return array.slice(1);
                }
                else {
                    log.warn("db `%s` integrity check has failed", path);
                    return [];
                }
            }
            return array;
        }
        catch (e) {
            log.error("db `%s` is broken (%s: %s)", path, e.name, e.message);
            return [];
        }
    });
}
async function save(path, data, integrity) {
    log.info("save db `%s` w/ integrity (%s)", path, integrity);
    const writeData = [{ __integrity__: integrity }, ...data];
    return dbIOQueue.add(async () => {
        const dirPath = (0, path_1.dirname)(path);
        if ((0, fs_1.existsSync)(dirPath) === false) {
            await (0, promises_1.mkdir)(dirPath, { recursive: true });
        }
        await (0, promises_1.writeFile)(path, JSON.stringify(writeData));
    });
}
process.on("beforeExit", () => {
    if (dbIOQueue.getQueueLength() + dbIOQueue.getPendingLength() === 0) {
        return;
    }
    log.warn("dbIOQueue is not empty. waiting for completion...");
    setTimeout(() => {
        log.warn("try to exit again...");
    }, 100);
});
//# sourceMappingURL=db.js.map