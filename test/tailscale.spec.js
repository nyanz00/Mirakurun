const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");
const { once } = require("node:events");
const { setImmediate: nextTurn } = require("node:timers/promises");
const system = require("../lib/Mirakurun/system");
const shared = require("../lib/Mirakurun/_").default;
// Server imports a process-wide statistics timer; it is unrelated to listener tests.
const statusPath = require.resolve("../lib/Mirakurun/status");
require.cache[statusPath] = {
    id: statusPath, filename: statusPath, loaded: true,
    exports: { default: { rpcCount: 0 } }
};
const { Server } = require("../lib/Mirakurun/Server");

describe("Tailscale startup listener", () => {
    it("selects only permitted IPv4 addresses on named Tailscale interfaces", t => {
        const previous = shared.config.server;
        t.after(() => { shared.config.server = previous; });
        shared.config.server = { allowIPv4CidrRanges: ["100.64.0.0/10"] };
        const ipv4 = address => ({ address, family: "IPv4", internal: false });
        t.mock.method(os, "networkInterfaces", () => ({
            Ethernet: [ipv4("100.64.0.1")],
            Tailscale: [ipv4("100.64.0.2"), ipv4("192.168.1.2"),
                { address: "fd7a:115c:a1e0::1", family: "IPv6", internal: false }],
            tailscale0: [ipv4("100.64.0.3")]
        }));
        assert.deepEqual(system.getTailscaleIPv4AddressesForListen(), ["100.64.0.2", "100.64.0.3"]);
        assert.deepEqual(system.getIPv4AddressesForListen(), ["100.64.0.1", "100.64.0.2", "100.64.0.3"]);
        assert.deepEqual(system.getIPv4AddressesForListen(true), ["100.64.0.1"]);
    });

    it("waits for an interface, then serves HTTP and RPC and stops polling", async t => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        let addresses = [];
        const discovery = t.mock.method(system, "getTailscaleIPv4AddressesForListen", () => addresses);
        const server = new Server();
        server._isRunning = true;
        t.after(() => server.deinit());
        const app = (req, res) => res.end("ready");
        server._startTailscaleCheck(app, 0);
        await server._tailscaleCheck;
        assert.equal(server.servers.size, 0);
        addresses = ["127.0.0.1"];
        t.mock.timers.tick(30000);
        await server._tailscaleCheck;
        assert.equal(server.servers.size, 1);
        assert.equal(server._rpcs.size, 1);
        const listener = [...server.servers][0];
        assert.equal(listener.listenerCount("upgrade"), 1);
        const response = await fetch(`http://127.0.0.1:${listener.address().port}`);
        assert.equal(await response.text(), "ready");
        listener.closeIdleConnections();
        t.mock.timers.tick(60000);
        assert.equal(discovery.mock.callCount(), 2);
        assert.equal(server._tailscaleTimer, undefined);
    });

    it("retries a bind failure without leaking listeners or RPC servers", async t => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        t.mock.method(system, "getTailscaleIPv4AddressesForListen", () => ["127.0.0.1"]);
        const occupied = http.createServer();
        occupied.listen(0, "127.0.0.1");
        await once(occupied, "listening");
        t.after(() => occupied.close());
        const port = occupied.address().port;
        const server = new Server();
        server._isRunning = true;
        t.after(() => server.deinit());
        server._startTailscaleCheck((req, res) => res.end(), port);
        await server._tailscaleCheck;
        assert.equal(server.servers.size, 0);
        assert.equal(server._rpcs.size, 0);
        await new Promise(resolve => occupied.close(resolve));
        t.mock.timers.tick(30000);
        await server._tailscaleCheck;
        assert.equal(server.servers.size, 1);
        assert.equal(server._tailscaleTimer, undefined);
    });

    it("recognizes an existing listener without duplicating it", async t => {
        t.mock.method(system, "getTailscaleIPv4AddressesForListen", () => ["127.0.0.1"]);
        const server = new Server();
        server._isRunning = true;
        t.after(() => server.deinit());
        const listener = http.createServer();
        listener.listen(0, "127.0.0.1");
        await once(listener, "listening");
        server.servers.add(listener);
        server._startTailscaleCheck((req, res) => res.end(), listener.address().port);
        await server._tailscaleCheck;
        assert.equal(server.servers.size, 1);
        assert.equal(server._rpcs.size, 0);
        assert.equal(server._tailscaleTimer, undefined);
    });

    it("cancels polling when stopped", async t => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const discovery = t.mock.method(system, "getTailscaleIPv4AddressesForListen", () => []);
        const server = new Server();
        server._isRunning = true;
        server._startTailscaleCheck((req, res) => res.end(), 0);
        await server._tailscaleCheck;
        await server.deinit();
        t.mock.timers.tick(60000);
        await nextTurn();
        assert.equal(discovery.mock.callCount(), 1);
        assert.equal(server._tailscaleTimer, undefined);
    });

    it("closes a listener whose bind completes during shutdown", async t => {
        t.mock.method(system, "getTailscaleIPv4AddressesForListen", () => ["127.0.0.1"]);
        const server = new Server();
        server._isRunning = true;
        server._startTailscaleCheck((req, res) => res.end(), 0);
        await server.deinit();
        assert.equal(server.servers.size, 0);
        assert.equal(server._rpcs.size, 0);
        assert.equal(server._tailscaleTimer, undefined);
    });
});
