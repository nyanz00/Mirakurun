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
const api = __importStar(require("../../api"));
const _1 = __importDefault(require("../../_"));
const Service_1 = __importDefault(require("../../Service"));
exports.parameters = [
    {
        in: "path",
        name: "id",
        type: "integer",
        maximum: 6553565535,
        required: true
    }
];
const get = async (req, res) => {
    const serviceItem = _1.default.service.get(req.params.id);
    if (serviceItem === null || serviceItem === undefined) {
        api.responseError(res, 404);
        return;
    }
    const hasLogoData = await Service_1.default.isLogoDataExists(serviceItem.networkId, serviceItem.logoId) ||
        await _1.default.tuner.hasRemoteLogoData(serviceItem);
    const service = {
        ...serviceItem.export(),
        hasLogoData
    };
    api.responseJSON(res, service);
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["services"],
    operationId: "getService",
    responses: {
        200: {
            description: "OK",
            schema: {
                $ref: "#/definitions/Service"
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
//# sourceMappingURL=%7Bid%7D.js.map