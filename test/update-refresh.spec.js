const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../lib/Mirakurun/_").default;
const manager = require("../lib/Mirakurun/update/UpdateManager").default;
const updateRoute = require("../lib/Mirakurun/api/system/update");

describe("Web update refresh", () => {
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
