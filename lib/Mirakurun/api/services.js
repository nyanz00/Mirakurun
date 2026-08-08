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
exports.get = void 0;
const sift_1 = __importDefault(require("sift"));
const api = __importStar(require("../api"));
const _1 = __importDefault(require("../_"));
const Service_1 = __importDefault(require("../Service"));
const common_1 = require("../common");
const get = async (req, res) => {
    const serviceItems = [..._1.default.service.items];
    serviceItems.sort((a, b) => a.getOrder() - b.getOrder());
    const services = [];
    for (const serviceItem of serviceItems.filter((0, sift_1.default)(req.query))) {
        const hasLogoData = await Service_1.default.isLogoDataExists(serviceItem.networkId, serviceItem.logoId) ||
            await _1.default.tuner.hasRemoteLogoData(serviceItem);
        services.push({
            ...serviceItem.export(),
            hasLogoData
        });
    }
    api.responseJSON(res, services);
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["services"],
    operationId: "getServices",
    parameters: [
        {
            in: "query",
            name: "serviceId",
            type: "integer",
            required: false
        },
        {
            in: "query",
            name: "networkId",
            type: "integer",
            required: false
        },
        {
            in: "query",
            name: "name",
            type: "string",
            required: false
        },
        {
            in: "query",
            name: "type",
            type: "integer",
            required: false
        },
        {
            in: "query",
            name: "channel.type",
            type: "string",
            enum: common_1.channelTypes,
            required: false
        },
        {
            in: "query",
            name: "channel.channel",
            type: "string",
            required: false
        }
    ],
    responses: {
        200: {
            description: "OK",
            schema: {
                type: "array",
                items: {
                    $ref: "#/definitions/Service"
                }
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
//# sourceMappingURL=services.js.map