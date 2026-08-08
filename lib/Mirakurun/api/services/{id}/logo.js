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
const _1 = __importDefault(require("../../../_"));
const Service_1 = __importDefault(require("../../../Service"));
const log = __importStar(require("../../../log"));
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
    const service = _1.default.service.get(req.params.id);
    if (service === null || service === undefined) {
        res.writeHead(404, "Not Found");
        res.end();
        return;
    }
    if (typeof service.logoId !== "number" || service.logoId < 0) {
        res.writeHead(503, "Logo Data Unavailable");
        res.end();
        return;
    }
    const logoData = await Service_1.default.loadLogoData(service.networkId, service.logoId);
    if (logoData) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.status(200);
        res.end(logoData);
        return;
    }
    const remoteDevice = _1.default.tuner.getRemoteDeviceByChannel(service.channel);
    if (remoteDevice !== null) {
        try {
            const remoteLogoData = await remoteDevice.getRemoteLogoImage(service.id);
            if (remoteLogoData) {
                await Service_1.default.saveLogoData(service.networkId, service.logoId, remoteLogoData).catch(err => {
                    log.warn("failed to cache remote logo data (serviceId=%d networkId=%d logoId=%d): %s", service.id, service.networkId, service.logoId, err);
                });
                res.setHeader("Content-Type", "image/png");
                res.setHeader("Cache-Control", "public, max-age=86400");
                res.status(200);
                res.end(remoteLogoData);
                return;
            }
        }
        catch (err) {
            if (err.status === 503) {
                log.debug("remote logo data is unavailable (serviceId=%d networkId=%d logoId=%d)", service.id, service.networkId, service.logoId);
            }
            else {
                log.warn("failed to fetch remote logo data (serviceId=%d networkId=%d logoId=%d): %s", service.id, service.networkId, service.logoId, err);
            }
        }
    }
    res.writeHead(503, "Logo Data Unavailable");
    res.end();
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["services"],
    operationId: "getLogoImage",
    produces: ["image/png"],
    responses: {
        200: {
            description: "OK"
        },
        404: {
            description: "Not Found"
        },
        503: {
            description: "Logo Data Unavailable"
        },
        default: {
            description: "Unexpected Error"
        }
    }
};
//# sourceMappingURL=logo.js.map