/*
   Copyright 2016 kanreisa

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
import * as fs from "fs";
import * as http from "http";
import { promisify } from "util";
import express from "express";
import cors from "cors";
import mime from "mime";
import * as openapi from "express-openapi";
import morgan from "morgan";
import * as yaml from "js-yaml";
import { OpenAPIV2 } from "openapi-types";
import RPCServer from "jsonrpc2-ws/lib/server";
import { sleep } from "./common";
import * as log from "./log";
import * as system from "./system";
import regexp from "./regexp";
import _ from "./_";
import { createRPCServer, initRPCNotifier } from "./rpc";
import * as configChannelsAPI from "./api/config/channels";
import * as configChannelsScanAPI from "./api/config/channels/scan";
import * as configServerAPI from "./api/config/server";
import * as configTunersAPI from "./api/config/tuners";
import * as channelStreamAPI from "./api/channels/{type}/{channel}/stream";
import * as channelServiceStreamAPI from "./api/channels/{type}/{channel}/services/{id}/stream";
import * as programStreamAPI from "./api/programs/{id}/stream";
import * as serviceStreamAPI from "./api/services/{id}/stream";

const pkg = require("../../package.json");

export class Server {
    /** used for test */
    testMode = false;

    private _isRunning = false;
    private _servers = new Set<http.Server>();
    private _rpcs = new Set<RPCServer>();

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

        const serverConfig = _.config.server;

        const addresses: string[] = [];

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
                    } catch (e) {
                        console.error(e);
                    }
                    log.warn("Server hasn't detected IPv4 addresses...");
                    await sleep(5000);
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

        const app = express();

        app.disable("x-powered-by");
        app.disable("etag");

        app.use((req: express.Request, res: express.Response, next) => {
            req.url = req.url.replace(/\\/g, "/");
            next();
        });

        app.use(morgan(":remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :response-time ms :user-agent", {
            stream: log.event as any
        }));
        app.use(express.urlencoded({ extended: false }));
        app.use(express.json());

        app.use((req: express.Request, res: express.Response, next) => {
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
                res.setHeader("Access-Control-Allow-Private-Network", "true");
                res.setHeader("Private-Network-Access-Name", `Mirakurun_${serverConfig.hostname}`);
                res.setHeader("Private-Network-Access-ID", "00:00:00:00:00:00");
            }

            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

            res.setHeader("Server", "Mirakurun/" + pkg.version);
            next();
        });

        // do not place before the access control
        app.use(cors());

        if (!serverConfig.disableWebUI) {
            app.use(express.static("lib/ui", {
                setHeaders: (res, path) => {
                    if (mime.getType(path) === "image/svg+xml") {
                        res.setHeader("Cache-Control", "public, max-age=86400");
                    }
                }
            }));
            app.use("/redoc", express.static("node_modules/redoc/bundles"));
            app.use("/redoc-try", express.static("node_modules/redoc-try/dist"));
            app.use("/api/debug", express.static("lib/ui/redoc-ui.html"));
        }

        app.get("/api/config/server", configServerAPI.get as express.RequestHandler);
        app.put("/api/config/server", configServerAPI.put as express.RequestHandler);
        app.get("/api/config/tuners", configTunersAPI.get as express.RequestHandler);
        app.put("/api/config/tuners", configTunersAPI.put as express.RequestHandler);
        app.get("/api/config/channels", configChannelsAPI.get as express.RequestHandler);
        app.put("/api/config/channels", configChannelsAPI.put as express.RequestHandler);
        app.get("/api/config/channels/scan", configChannelsScanAPI.get as express.RequestHandler);
        app.put("/api/config/channels/scan", configChannelsScanAPI.put as express.RequestHandler);
        app.get("/api/programs/:id/stream", programStreamAPI.get as express.RequestHandler);
        app.head("/api/programs/:id/stream", programStreamAPI.head as express.RequestHandler);
        app.get("/api/services/:id/stream", serviceStreamAPI.get as express.RequestHandler);
        app.head("/api/services/:id/stream", serviceStreamAPI.head as express.RequestHandler);
        app.get("/api/channels/:type/:channel/stream", channelStreamAPI.get as express.RequestHandler);
        app.head("/api/channels/:type/:channel/stream", channelStreamAPI.head as express.RequestHandler);
        app.get("/api/channels/:type/:channel/services/:id/stream", channelServiceStreamAPI.get as express.RequestHandler);
        app.head("/api/channels/:type/:channel/services/:id/stream", channelServiceStreamAPI.head as express.RequestHandler);

        const api = yaml.load(fs.readFileSync("api.yml", "utf8")) as OpenAPIV2.Document;
        api.info.version = pkg.version;

        openapi.initialize({
            app: app,
            apiDoc: api,
            docsPath: "/docs",
            paths: "./lib/Mirakurun/api"
        });

        app.use((err, req, res: express.Response, next) => {
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
            server.timeout = 1000 * 15; // 15 sec.

            this._servers.add(server);
            this._rpcs.add(createRPCServer(server));

            if (regexp.unixDomainSocket.test(address) || regexp.windowsNamedPipe.test(address)) {
                if (fs.existsSync(address)) {
                    fs.unlinkSync(address);
                }

                await new Promise<void>(resolve => {
                    server.listen(address, () => {
                        if (regexp.windowsNamedPipe.test(address)) {
                            log.info("listening on http+pipe://%s", address);
                        } else {
                            log.info("listening on http+unix://%s", address.replace(/\//g, "%2F"));
                        }
                        resolve();
                    });
                });

                if (regexp.unixDomainSocket.test(address)) {
                    fs.chmodSync(address, "777");
                }
            } else {
                await new Promise<void>(resolve => {
                    server.listen(serverConfig.port, address, () => {
                        const serverAddr = server.address();
                        const port = typeof serverAddr === "string" ? serverConfig.port : serverAddr.port;
                        if (address.includes(":")) {
                            const [addr, iface] = address.split("%");
                            log.info("listening on http://[%s]:%d (%s)", addr, port, iface);
                        } else {
                            log.info("listening on http://%s:%d", address, port);
                        }
                        resolve();
                    });
                });
            }
        }

        // event notifications for RPC
        initRPCNotifier(this._rpcs);

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
            const serverCloseAsync = promisify(server.close).bind(server);
            await serverCloseAsync();
        }

        this._rpcs.clear();
        this._servers.clear();

        this._isRunning = false;
    }
}

export default Server;
