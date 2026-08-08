"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = void 0;
const _1 = __importDefault(require("../../_"));
const Service_1 = __importDefault(require("../../Service"));
const get = async (req, res) => {
    const apiRoot = `${req.protocol}://${req.headers.host}/api`;
    const services = [..._1.default.service.items];
    services.sort((a, b) => a.getOrder() - b.getOrder());
    let m = `#EXTM3U url-tvg="${apiRoot}/iptv/xmltv"\n`;
    for (const service of services) {
        if (service.type !== 1 && service.type !== 173) {
            continue;
        }
        m += `#KODIPROP:mimetype=video/mp2t\n`;
        m += `#EXTINF:-1 tvg-id="${service.id}"`;
        const hasLogoData = await Service_1.default.isLogoDataExists(service.networkId, service.logoId) ||
            await _1.default.tuner.hasRemoteLogoData(service);
        if (hasLogoData) {
            m += ` tvg-logo="${apiRoot}/services/${service.id}/logo"`;
        }
        m += ` group-title="${service.channel.type}",${service.name}\n`;
        m += `${apiRoot}/services/${service.id}/stream\n`;
    }
    res.setHeader("Content-Type", "application/x-mpegURL; charset=utf-8");
    res.status(200);
    res.end(m);
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["iptv"],
    summary: "IPTV - M3U Playlist",
    produces: ["application/x-mpegURL"],
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
//# sourceMappingURL=playlist.js.map