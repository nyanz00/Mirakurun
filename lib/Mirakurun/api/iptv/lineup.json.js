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
const api = __importStar(require("../../api"));
const _1 = __importDefault(require("../../_"));
const get = (req, res) => {
    const apiRoot = `${req.protocol}://${req.headers.host}/api`;
    const services = [..._1.default.service.items];
    services.sort((a, b) => a.getOrder() - b.getOrder());
    const channels = [];
    const countMap = new Map();
    for (const service of services) {
        if (service.type !== 1 && service.type !== 173) {
            continue;
        }
        const mainNum = service.remoteControlKeyId || service.serviceId;
        if (countMap.has(mainNum)) {
            countMap.set(mainNum, countMap.get(mainNum) + 1);
        }
        else {
            countMap.set(mainNum, 1);
        }
        const subNum = countMap.get(mainNum);
        channels.push({
            GuideNumber: `${mainNum}.${subNum}`,
            GuideName: service.name,
            HD: 1,
            URL: `${apiRoot}/services/${service.id}/stream`
        });
    }
    api.responseJSON(res, channels);
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["iptv"],
    summary: "IPTV - Media Server Support",
    responses: {
        200: {
            description: "OK"
        },
        default: {
            description: "Unexpected Error",
            schema: {
                $ref: "#/definitions/Error"
            }
        }
    }
};
//# sourceMappingURL=lineup.json.js.map