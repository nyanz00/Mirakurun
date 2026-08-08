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
exports.put = exports.parameters = void 0;
const api = __importStar(require("../../../api"));
const _1 = __importDefault(require("../../../_"));
exports.parameters = [
    {
        in: "path",
        name: "key",
        type: "string",
        required: true
    }
];
const put = (req, res) => {
    const key = req.params.key;
    if (_1.default.job.schedules.find(s => s.key === key) === null) {
        api.responseError(res, 404);
        return;
    }
    try {
        _1.default.job.runSchedule(key);
        res.status(202);
        res.end();
        return;
    }
    catch (e) {
        if (e instanceof Error) {
            api.responseError(res, 500, e.message);
            return;
        }
        api.responseError(res, 500);
    }
};
exports.put = put;
exports.put.apiDoc = {
    tags: ["job"],
    summary: "Request to run a job schedule",
    operationId: "runJobSchedule",
    responses: {
        202: {
            description: "Requested"
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
//# sourceMappingURL=run.js.map