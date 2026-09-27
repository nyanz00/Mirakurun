const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../lib/Mirakurun/_").default;
const restartRoute = require("../lib/Mirakurun/api/restart");

function response() {
    return {
        statusCode: 200,
        body: null,
        setHeader() { return this; },
        status(code) { this.statusCode = code; return this; },
        writeHead(code) { this.statusCode = code; return this; },
        end(body) { this.body = JSON.parse(body); return this; }
    };
}

describe("Windows service restart", () => {
    it("restarts only for an allowed update client", () => {
        const previousPlatform = Object.getOwnPropertyDescriptor(process, "platform");
        const previousWinser = process.env.USING_WINSER;
        const previousConfig = shared.config.server;
        const previousSetTimeout = global.setTimeout;
        const scheduled = [];
        Object.defineProperty(process, "platform", { ...previousPlatform, value: "win32" });
        process.env.USING_WINSER = "1";
        shared.config.server = { updateAllowIPv4CidrRanges: ["127.0.0.1/32"] };
        global.setTimeout = (callback, delay) => { scheduled.push({ callback, delay }); };
        try {
            const denied = response();
            restartRoute.put({ ip: "192.168.1.20" }, denied);
            assert.equal(denied.statusCode, 403);
            assert.equal(scheduled.length, 0);

            const accepted = response();
            restartRoute.put({ ip: "127.0.0.1" }, accepted);
            assert.equal(accepted.statusCode, 202);
            assert.deepEqual(accepted.body, { accepted: true });
            assert.equal(scheduled.length, 1);
            assert.equal(scheduled[0].delay, 500);
        } finally {
            Object.defineProperty(process, "platform", previousPlatform);
            if (previousWinser === undefined) {
                delete process.env.USING_WINSER;
            } else {
                process.env.USING_WINSER = previousWinser;
            }
            shared.config.server = previousConfig;
            global.setTimeout = previousSetTimeout;
        }
    });
});
