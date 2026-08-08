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
exports.Server = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const util_1 = require("util");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const openapi = __importStar(require("express-openapi"));
const morgan_1 = __importDefault(require("morgan"));
const yaml = __importStar(require("js-yaml"));
const common_1 = require("./common");
const log = __importStar(require("./log"));
const system = __importStar(require("./system"));
const regexp_1 = __importDefault(require("./regexp"));
const _1 = __importDefault(require("./_"));
const rpc_1 = require("./rpc");
const pkg = require("../../package.json");
const fsRoutesModule = require("fs-routes");
const fsRoutes = fsRoutesModule.default || fsRoutesModule;
function getOpenAPIPathSpecs() {
    return fsRoutes("./lib/Mirakurun/api").map(route => ({
        path: route.route.replace(/\\/g, "/"),
        module: require(route.path)
    }));
}
class Server {
    testMode = false;
    _isRunning = false;
    _servers = new Set();
    _rpcs = new Set();
    get isRunning() {
        return this._isRunning;
    }
    get servers() {
        return this._servers;
    }
    async init() {
        if (this._isRunning === true) {
            throw new Error("Server is running");
        }
        this._isRunning = true;
        const serverConfig = _1.default.config.server;
        const addresses = [];
        if (serverConfig.path) {
            addresses.push(serverConfig.path);
        }
        if (typeof serverConfig.port === "number") {
            if (!this.testMode) {
                while (true) {
                    try {
                        const systemIPv4s = system.getIPv4AddressesForListen();
                        if (systemIPv4s.length > 0) {
                            addresses.push(...systemIPv4s);
                            break;
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                    log.warn("Server hasn't detected IPv4 addresses...");
                    await (0, common_1.sleep)(5000);
                }
            }
            addresses.push("127.0.0.1");
            if (serverConfig.disableIPv6 !== true) {
                if (!this.testMode) {
                    addresses.push(...system.getIPv6AddressesForListen());
                }
                addresses.push("::1");
            }
        }
        const app = (0, express_1.default)();
        app.disable("x-powered-by");
        app.disable("etag");
        app.use((req, res, next) => {
            req.url = req.url.replace(/\\/g, "/");
            next();
        });
        app.use((0, morgan_1.default)(":remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :response-time ms :user-agent", {
            stream: log.event
        }));
        app.use(express_1.default.urlencoded({ extended: false }));
        app.use(express_1.default.json());
        app.use((req, res, next) => {
            if (req.ip && system.isPermittedIPAddress(req.ip) === false) {
                req.socket.end();
                return;
            }
            const origin = req.get("Origin");
            if (origin !== undefined) {
                if (!system.isPermittedHost(origin, serverConfig.hostname) && !serverConfig.allowOrigins.includes(origin)) {
                    res.status(403).end();
                    return;
                }
            }
            const referer = req.get("Referer");
            if (referer !== undefined) {
                if (!system.isPermittedHost(referer, serverConfig.hostname) && serverConfig.allowOrigins.every(o => !referer.startsWith(o))) {
                    res.status(403).end();
                    return;
                }
            }
            if (serverConfig.allowPNA && req.get("Access-Control-Request-Method") && req.get("Access-Control-Request-Private-Network") === "true") {
                res.set({
                    "Access-Control-Allow-Private-Network": "true",
                    "Private-Network-Access-Name": `Mirakurun_${serverConfig.hostname}`,
                    "Private-Network-Access-ID": "00:00:00:00:00"
                });
            }
            res.set({
                "Cross-Origin-Resource-Policy": "cross-origin",
                "Cross-Origin-Embedder-Policy": "require-corp",
                "Server": "Mirakurun/" + pkg.version,
                "X-Content-Type-Options": "nosniff",
                "X-Your-IP": req.ip
            });
            next();
        });
        app.use((0, cors_1.default)());
        if (!serverConfig.disableWebUI) {
            app.use(express_1.default.static("lib/ui"));
            app.use("/redoc", express_1.default.static("node_modules/redoc/bundles"));
            app.use("/redoc-try", express_1.default.static("node_modules/redoc-try/dist"));
            app.use("/api/debug", express_1.default.static("lib/ui/redoc-ui.html"));
            const indexPath = path.join(__dirname, "..", "ui", "index.html");
            app.get(/^\/(?!(api|assets|redoc))/, (request, response) => {
                response.sendFile(indexPath);
            });
        }
        const api = yaml.load(fs.readFileSync("api.yml", "utf8"));
        api.info.version = pkg.version;
        openapi.initialize({
            app: app,
            apiDoc: api,
            docsPath: "/docs",
            paths: getOpenAPIPathSpecs()
        });
        app.use((err, req, res, next) => {
            if (err.message === "Not allowed by CORS") {
                res.status(403).end();
                return;
            }
            log.error(JSON.stringify(err, null, "  "));
            console.error(err.stack);
            if (res.headersSent === false) {
                res.writeHead(err.status || 500, {
                    "Content-Type": "application/json"
                });
            }
            res.end(JSON.stringify({
                code: res.statusCode,
                reason: err.message || res.statusMessage,
                errors: err.errors
            }));
            next();
        });
        if (!this._isRunning) {
            return;
        }
        for (const address of addresses) {
            const server = http.createServer(app);
            server.timeout = 1000 * 15;
            this._servers.add(server);
            this._rpcs.add((0, rpc_1.createRPCServer)(server));
            if (regexp_1.default.unixDomainSocket.test(address) || regexp_1.default.windowsNamedPipe.test(address)) {
                if (fs.existsSync(address)) {
                    fs.unlinkSync(address);
                }
                await new Promise(resolve => {
                    server.listen(address, () => {
                        if (regexp_1.default.windowsNamedPipe.test(address)) {
                            log.info("listening on http+pipe://%s", address);
                        }
                        else {
                            log.info("listening on http+unix://%s", address.replace(/\//g, "%2F"));
                        }
                        resolve();
                    });
                });
                if (regexp_1.default.unixDomainSocket.test(address)) {
                    fs.chmodSync(address, "777");
                }
            }
            else {
                await new Promise(resolve => {
                    server.listen(serverConfig.port, address, () => {
                        const serverAddr = server.address();
                        const port = typeof serverAddr === "string" ? serverConfig.port : serverAddr.port;
                        if (address.includes(":")) {
                            const [addr, iface] = address.split("%");
                            log.info("listening on http://[%s]:%d (%s)", addr, port, iface);
                        }
                        else {
                            log.info("listening on http://%s:%d", address, port);
                        }
                        resolve();
                    });
                });
            }
        }
        (0, rpc_1.initRPCNotifier)(this._rpcs);
        log.info("RPC interface is enabled");
    }
    async deinit() {
        if (this._isRunning === false) {
            return;
        }
        for (const rpc of this._rpcs) {
            await rpc.close();
        }
        for (const server of this._servers) {
            const serverCloseAsync = (0, util_1.promisify)(server.close).bind(server);
            await serverCloseAsync();
        }
        this._rpcs.clear();
        this._servers.clear();
        this._isRunning = false;
    }
}
exports.Server = Server;
exports.default = Server;
//# sourceMappingURL=Server.js.map