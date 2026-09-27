const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../lib/Mirakurun/_").default;
const { canManageUpdate } = require("../lib/Mirakurun/update/access");

describe("Web update IP authorization", () => {
    it("allows loopback and configured management networks only", () => {
        const previous = shared.config.server;
        shared.config.server = { updateAllowIPv4CidrRanges: ["127.0.0.1/32", "192.168.10.42/32"] };
        try {
            assert.equal(canManageUpdate("127.0.0.1"), true);
            assert.equal(canManageUpdate("::ffff:127.0.0.1"), true);
            assert.equal(canManageUpdate("::1"), true);
            assert.equal(canManageUpdate("192.168.10.42"), true);
            assert.equal(canManageUpdate("192.168.10.43"), false);
            assert.equal(canManageUpdate("8.8.8.8"), false);
            assert.equal(canManageUpdate("invalid"), false);
        } finally {
            shared.config.server = previous;
        }
    });
});
