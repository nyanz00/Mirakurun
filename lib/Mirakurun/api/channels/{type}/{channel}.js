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
exports.get = exports.parameters = void 0;
const api = __importStar(require("../../../api"));
const _1 = __importDefault(require("../../../_"));
const common_1 = require("../../../common");
exports.parameters = [
    {
        in: "path",
        name: "type",
        type: "string",
        enum: common_1.channelTypes,
        required: true
    },
    {
        in: "path",
        name: "channel",
        type: "string",
        required: true
    }
];
const get = (req, res) => {
    const channel = _1.default.channel.get(req.params.type, req.params.channel);
    if (channel === null) {
        api.responseError(res, 404);
        return;
    }
    const body = (0, common_1.deepClone)(channel);
    body.services = channel.getServices().map(service => ({
        id: service.id,
        serviceId: service.serviceId,
        networkId: service.networkId,
        name: service.name,
        type: service.type
    }));
    api.responseJSON(res, body);
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["channels"],
    operationId: "getChannel",
    responses: {
        200: {
            description: "OK",
            schema: {
                $ref: "#/definitions/Channel"
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
//# sourceMappingURL=%7Bchannel%7D.js.map