const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const config = require("../lib/Mirakurun/config");
const serverConfig = require("../lib/Mirakurun/api/config/server");

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        setHeader() { return this; },
        writeHead(code) { this.statusCode = code; return this; },
        end(body) { this.body = JSON.parse(body); return this; }
    };
}

describe("Web update allowlist configuration", () => {
    it("rejects changes from remote clients while preserving ordinary config edits", async () => {
        const originalLoad = config.loadServer;
        const originalSave = config.saveServer;
        let saved = { updateAllowIPv4CidrRanges: ["127.0.0.1/32"], logLevel: 2 };
        config.loadServer = async () => ({ ...saved });
        config.saveServer = async value => { saved = { ...value }; };
        try {
            const changed = response();
            await serverConfig.put({ ip: "192.168.1.20", body: {
                ...saved, updateAllowIPv4CidrRanges: ["127.0.0.1/32", "192.168.1.20/32"]
            } }, changed);
            assert.equal(changed.statusCode, 403);
            assert.deepEqual(saved.updateAllowIPv4CidrRanges, ["127.0.0.1/32"]);

            const ordinary = response();
            await serverConfig.put({ ip: "192.168.1.20", body: { logLevel: 3 } }, ordinary);
            assert.equal(ordinary.statusCode, 200);
            assert.equal(saved.logLevel, 3);
            assert.deepEqual(saved.updateAllowIPv4CidrRanges, ["127.0.0.1/32"]);

            const local = response();
            await serverConfig.put({ ip: "::ffff:127.0.0.1", body: {
                ...saved, updateAllowIPv4CidrRanges: ["127.0.0.1/32", "192.168.1.20/32"]
            } }, local);
            assert.equal(local.statusCode, 200);
            assert.deepEqual(saved.updateAllowIPv4CidrRanges, ["127.0.0.1/32", "192.168.1.20/32"]);

            const updateClient = response();
            await serverConfig.put({ ip: "192.168.1.20", body: {
                ...saved, updateAllowIPv4CidrRanges: [...saved.updateAllowIPv4CidrRanges, "192.168.1.21/32"]
            } }, updateClient);
            assert.equal(updateClient.statusCode, 403);
            assert.deepEqual(saved.updateAllowIPv4CidrRanges, ["127.0.0.1/32", "192.168.1.20/32"]);
        } finally {
            config.loadServer = originalLoad;
            config.saveServer = originalSave;
        }
    });
});
