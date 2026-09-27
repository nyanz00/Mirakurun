const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../lib/Mirakurun/_").default;
const manager = require("../lib/Mirakurun/update/UpdateManager").default;
const updateRoute = require("../lib/Mirakurun/api/system/update");

describe("Web update refresh", () => {
    it("limits repeated forced checks to once per five seconds while allowing update preflight", async () => {
        const previousFetchRemote = manager.fetchRemote;
        const previousRefreshAt = manager.lastRemoteRefreshAt;
        let fetches = 0;
        manager.fetchRemote = async () => { fetches++; };
        try {
            manager.lastRemoteRefreshAt = Date.now();
            await manager.refreshRemote(true);
            assert.equal(fetches, 0);

            manager.lastRemoteRefreshAt = Date.now() - 5001;
            await manager.refreshRemote(true);
            await manager.refreshRemote(true);
            assert.equal(fetches, 1);

            await manager.refreshRemote(true, true);
            assert.equal(fetches, 2);
        } finally {
            manager.fetchRemote = previousFetchRemote;
            manager.lastRemoteRefreshAt = previousRefreshAt;
        }
    });

    it("forces a GitHub check for a boolean or string refresh query", async () => {
        const previousConfig = shared.config.server;
        const previousGetInfo = manager.getInfo;
        const calls = [];
        shared.config.server = { updateAllowIPv4CidrRanges: ["127.0.0.1/32"] };
        manager.getInfo = async force => {
            calls.push(force);
            return { checkedAt: Date.now() };
        };
        const response = () => ({
            setHeader() {},
            status() { return this; },
            end() {}
        });
        try {
            await updateRoute.get({ query: { refresh: true }, ip: "127.0.0.1" }, response());
            await updateRoute.get({ query: { refresh: "true" }, ip: "127.0.0.1" }, response());
            await updateRoute.get({ query: {}, ip: "127.0.0.1" }, response());
            assert.deepEqual(calls, [true, true, false]);
        } finally {
            manager.getInfo = previousGetInfo;
            shared.config.server = previousConfig;
        }
    });
});
