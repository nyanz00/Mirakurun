const { it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { randomUUID } = require("node:crypto");
const express = require("express");
const shared = require("../lib/Mirakurun/_").default;
const statusPath = require.resolve("../lib/Mirakurun/status");
require.cache[statusPath] = { id: statusPath, filename: statusPath, loaded: true, exports: { default: {} } };
const manager = require("../lib/Mirakurun/remote/RemoteManager").default;
const { Tuner } = require("../lib/Mirakurun/Tuner");
const streamRoute = require("../lib/Mirakurun/api/channels/{type}/{channel}/stream");
const priorityRoute = require("../lib/Mirakurun/api/remote/priority");
const api = require("../lib/Mirakurun/api");

async function serve(t, app) {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await manager.stop();
    });
    return `http://127.0.0.1:${server.address().port}`;
}

it("tracks actual channel response data and changes the existing tuner user's priority", async t => {
    const previousChannel = shared.channel;
    t.after(() => { shared.channel = previousChannel; });
    let tunerUser;
    let destination;
    let closed = 0;
    const tuner = Object.create(Tuner.prototype);
    tuner._initTS = async (user, output) => {
        tunerUser = user;
        destination = output;
        return { close: () => { closed++; } };
    };
    const channel = { getServices: () => [], getStream: (user, output) => tuner.initChannelStream(channel, user, output) };
    shared.channel = { get: () => channel };
    const app = express();
    app.use(express.json());
    app.get("/api/channels/:type/:channel/stream", streamRoute.get);
    app.post("/api/remote/priority", priorityRoute.post);
    const base = await serve(t, app);
    const id = randomUUID();
    const responseReady = new Promise(resolve => {
        const request = http.get(`${base}/api/channels/GR/11/stream`, {
            headers: { "X-Mirakurun-Priority": "2", "X-Mirakurun-Remote-ID": id }
        }, resolve);
        t.after(() => request.destroy());
    });
    for (let count = 0; !destination && count < 100; count++) {
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.ok(destination);
    assert.equal(tunerUser.priority, 2);
    assert.equal(manager.incoming.get(id).firstData, 0, "allocation alone is not stream success");
    const updated = await fetch(`${base}/api/remote/priority`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, priority: 256 })
    });
    assert.equal(updated.status, 200);
    await updated.json();
    assert.equal(tunerUser.priority, 256, "the tuner keeps a live priority reference");
    destination.write(Buffer.alloc(188, 0x47));
    const response = await responseReady;
    response.resume();
    assert.ok(manager.incoming.get(id).firstData > 0);
    assert.equal(manager.incoming.get(id).subject, "127.0.0.1/GR/11");
    const onClose = once(destination, "close");
    response.destroy();
    await onClose;
    assert.equal(manager.incoming.get(id).closed, true);
    assert.equal(closed, 1);
});

it("returns Japanese validation errors as JSON without an invalid HTTP reason phrase", async t => {
    const app = express();
    app.get("/error", (req, res) => api.responseError(res, 400, "接続先が不正です"));
    const base = await serve(t, app);
    const response = await fetch(`${base}/error`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).reason, "接続先が不正です");
});

it("keeps webhook secrets on partial saves, hides them in responses, and restricts remote setting changes", async t => {
    const config = require("../lib/Mirakurun/config");
    const routes = require("../lib/Mirakurun/api/config/server");
    const previous = shared.config.server;
    shared.config.server = { updateAllowIPv4CidrRanges: ["127.0.0.1/32"] };
    t.after(() => { shared.config.server = previous; });
    let saved = { remoteDiscordWebhook: "https://discord.com/api/webhooks/123/test-token", remoteManagementEnabled: true };
    t.mock.method(config, "loadServer", async () => ({ ...saved }));
    t.mock.method(config, "loadTuners", async () => []);
    t.mock.method(config, "saveServer", async value => { saved = { ...value }; });
    const app = express();
    app.use(express.json());
    app.get("/config", routes.get);
    const RequestValidator = require("openapi-request-validator").default;
    const document = require("js-yaml").load(require("node:fs").readFileSync(require("node:path").join(__dirname, "../api.yml"), "utf8"));
    const validator = new RequestValidator({ parameters: routes.put.apiDoc.parameters, schemas: document.definitions });
    app.put("/config", (req, res, next) => {
        const error = validator.validateRequest(req);
        if (error) res.status(400).json(error);
        else next();
    }, routes.put);
    const base = await serve(t, app);
    const response = await fetch(`${base}/config`);
    const visible = await response.json();
    assert.equal(visible.remoteDiscordWebhook, undefined);
    assert.equal(visible.remoteDiscordWebhookConfigured, true);
    const save = await fetch(`${base}/config`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logLevel: 3 })
    });
    assert.equal(save.status, 200);
    assert.equal((await save.json()).remoteDiscordWebhook, undefined);
    assert.equal(saved.remoteDiscordWebhook, "https://discord.com/api/webhooks/123/test-token");
    assert.equal(saved.remoteManagementEnabled, true);
    const roundTrip = await fetch(`${base}/config`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(visible)
    });
    assert.equal(roundTrip.status, 200, "existing config editors can send back the public config");
    await roundTrip.json();
    assert.equal(saved.remoteDiscordWebhookConfigured, undefined);
    let code;
    await routes.put({ ip: "192.0.2.2", body: { remoteAutoRestart: true } }, {
        writeHead: value => { code = value; }, end: () => {}
    });
    assert.equal(code, 403);
    assert.equal(saved.remoteAutoRestart, undefined);
});
