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
exports.del = exports.get = exports.parameters = void 0;
const api = __importStar(require("../../../api"));
const _1 = __importDefault(require("../../../_"));
exports.parameters = [
    {
        in: "path",
        name: "index",
        type: "integer",
        minimum: 0,
        required: true
    }
];
const get = (req, res) => {
    const tuner = _1.default.tuner.get(req.params.index);
    if (tuner === null || Number.isInteger(tuner.pid) === false) {
        api.responseError(res, 404);
        return;
    }
    const tunerProcess = { pid: tuner.pid };
    api.responseJSON(res, tunerProcess);
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["tuners"],
    summary: "Get Tuner Process Info",
    operationId: "getTunerProcess",
    responses: {
        200: {
            description: "OK",
            schema: {
                $ref: "#/definitions/TunerProcess"
            }
        },
        404: {
            description: "Not Found",
            schema: {
                $ref: "#/definitions/Error"
            }
        },
        default: {
            description: "Unexpected Error",
            schema: {
                $ref: "#/definitions/Error"
            }
        }
    }
};
const del = async (req, res) => {
    const tuner = _1.default.tuner.get(req.params.index);
    if (tuner === null || Number.isInteger(tuner.pid) === false) {
        api.responseError(res, 404);
        return;
    }
    try {
        await tuner.kill();
    }
    catch (err) {
        api.responseError(res, 500, err.message);
        return;
    }
    res.status(204).end();
};
exports.del = del;
exports.del.apiDoc = {
    tags: ["tuners"],
    summary: "Kill Tuner Process",
    operationId: "killTunerProcess",
    responses: {
        204: {
            description: "Killed"
        },
        404: {
            description: "Not Found",
            schema: {
                $ref: "#/definitions/Error"
            }
        },
        default: {
            description: "Unexpected Error",
            schema: {
                $ref: "#/definitions/Error"
            }
        }
    }
};
//# sourceMappingURL=process.js.map