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
exports.getIPv4AddressesForListen = getIPv4AddressesForListen;
exports.getIPv6AddressesForListen = getIPv6AddressesForListen;
exports.isPermittedIPAddress = isPermittedIPAddress;
exports.isPermittedHost = isPermittedHost;
exports.getLatestVersion = getLatestVersion;
const os = __importStar(require("os"));
const https = __importStar(require("https"));
const Validator_1 = require("ip-num/Validator");
const IPNumber_1 = require("ip-num/IPNumber");
const Prefix_1 = require("ip-num/Prefix");
const IPRange_1 = require("ip-num/IPRange");
const _1 = __importDefault(require("./_"));
function getIPv4AddressesForListen() {
    const addresses = [];
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(k => {
        interfaces[k]
            .filter(a => {
            return (a.family === "IPv4" &&
                a.internal === false &&
                isPermittedIPAddress(a.address) === true);
        })
            .forEach(a => addresses.push(a.address));
    });
    return addresses;
}
function getIPv6AddressesForListen() {
    const addresses = [];
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(k => {
        interfaces[k]
            .filter(a => {
            return (a.family === "IPv6" &&
                a.internal === false &&
                isPermittedIPAddress(a.address) === true);
        })
            .forEach(a => addresses.push(a.address + "%" + k));
    });
    return addresses;
}
function isPermittedIPAddress(addr) {
    const [isIPv4] = Validator_1.Validator.isValidIPv4String(addr);
    if (isIPv4) {
        const ipv4 = new IPRange_1.IPv4CidrRange(new IPNumber_1.IPv4(addr), new Prefix_1.IPv4Prefix(32));
        for (const rangeString of _1.default.config.server.allowIPv4CidrRanges) {
            if (ipv4.inside(IPRange_1.IPv4CidrRange.fromCidr(rangeString))) {
                return true;
            }
        }
    }
    const [isIPv6] = Validator_1.Validator.isValidIPv6String(addr);
    if (isIPv6) {
        const ipv6 = new IPRange_1.IPv6CidrRange(new IPNumber_1.IPv6(addr), new Prefix_1.IPv6Prefix(128));
        for (const rangeString of _1.default.config.server.allowIPv6CidrRanges) {
            if (ipv6.inside(IPRange_1.IPv6CidrRange.fromCidr(rangeString))) {
                return true;
            }
        }
    }
    return false;
}
function isPermittedHost(url, allowedHostname) {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === allowedHostname || isPermittedIPAddress(u.hostname) === true) {
        return true;
    }
    return false;
}
async function getLatestVersion() {
    return new Promise((resolve, reject) => {
        const req = https.request("https://registry.npmjs.org/mirakurun/latest", {
            headers: {
                "Accept": "application/json",
                "User-Agent": "Mirakurun"
            },
            timeout: 10000
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => {
                chunks.push(Buffer.from(chunk));
            });
            res.on("end", () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`npm registry responded with ${res.statusCode}`));
                    return;
                }
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                    if (typeof data.version !== "string") {
                        reject(new Error("npm registry response does not include version"));
                        return;
                    }
                    resolve(data.version);
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on("timeout", () => {
            req.destroy(new Error("npm registry request timed out"));
        });
        req.on("error", reject);
        req.end();
    });
}
//# sourceMappingURL=system.js.map