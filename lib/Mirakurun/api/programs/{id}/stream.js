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
exports.head = exports.get = exports.parameters = void 0;
const api = __importStar(require("../../../api"));
const _1 = __importDefault(require("../../../_"));
exports.parameters = [
    {
        in: "path",
        name: "id",
        type: "integer",
        minimum: 10000000000,
        maximum: 655356553565535,
        required: true
    },
    {
        in: "header",
        name: "X-Mirakurun-Priority",
        type: "integer",
        minimum: 0
    },
    {
        in: "query",
        name: "decode",
        type: "integer",
        minimum: 0,
        maximum: 1
    }
];
const get = (req, res) => {
    const program = _1.default.program.get(parseInt(req.params.id, 10));
    if (program === null) {
        api.responseError(res, 404);
        return;
    }
    const userId = (req.ip || "unix") + ":" + (req.socket.remotePort || Date.now());
    if (req.method === "HEAD") {
        res.setHeader("Content-Type", "video/MP2T");
        res.setHeader("X-Mirakurun-Tuner-User-ID", userId);
        res.status(200).end();
        return;
    }
    let requestAborted = false;
    req.once("close", () => requestAborted = true);
    res.socket._writableState.highWaterMark = Math.max(res.writableHighWaterMark, 1024 * 1024 * 16);
    res.socket.setNoDelay(true);
    _1.default.tuner.initProgramStream(program, {
        id: userId,
        priority: parseInt(req.get("X-Mirakurun-Priority"), 10) || 0,
        agent: req.get("User-Agent"),
        url: req.url,
        disableDecoder: (parseInt(req.query.decode, 10) === 0)
    }, res)
        .then(tsFilter => {
        if (requestAborted === true || req.aborted === true) {
            return tsFilter.close();
        }
        req.once("close", () => tsFilter.close());
        res.setHeader("Content-Type", "video/MP2T");
        res.setHeader("X-Mirakurun-Tuner-User-ID", userId);
        res.status(200);
        req.setTimeout(1000 * 60 * 10);
    })
        .catch((err) => api.responseStreamErrorHandler(res, err));
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["programs", "stream"],
    operationId: "getProgramStream",
    produces: ["video/MP2T"],
    responses: {
        200: {
            description: "OK",
            headers: {
                "X-Mirakurun-Tuner-User-ID": {
                    type: "string"
                }
            }
        },
        404: {
            description: "Not Found"
        },
        503: {
            description: "Tuner Resource Unavailable"
        },
        default: {
            description: "Unexpected Error"
        }
    }
};
const head = (...args) => (0, exports.get)(...args);
exports.head = head;
exports.head.apiDoc = {
    ...exports.get.apiDoc,
    operationId: undefined
};
//# sourceMappingURL=stream.js.map