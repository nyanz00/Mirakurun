const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const shared = require("../lib/Mirakurun/_").default;
const { canRestartService, restartService } = require("../lib/Mirakurun/service-process");
const restartRoute = require("../lib/Mirakurun/api/restart");
const manager = require("../lib/Mirakurun/update/UpdateManager").default;
const updateRoute = require("../lib/Mirakurun/api/system/update");

describe("Linux service restart", () => {
    it("requires systemd supervision for successful-exit restarts, retaining the IP restriction", async () => {
        const platform = Object.getOwnPropertyDescriptor(process, "platform");
        const savedEnv = { ...process.env };
        const config = shared.config.server;
        const timeout = global.setTimeout;
        const exit = process.exit;
        const getInfo = manager.getInfo;
        const job = manager.job;
        const scheduled = [];
        let exits = 0;
        const response = () => ({
            statusCode: 200, body: null,
            status(code) { this.statusCode = code; return this; },
            writeHead(code) { this.statusCode = code; return this; },
            setHeader() {}, end(body) { this.body = JSON.parse(body); }
        });
        try {
            Object.defineProperty(process, "platform", { ...platform, value: "linux" });
            delete process.env.DOCKER;
            delete process.env.USING_SYSTEMD;
            assert.equal(canRestartService(), false);
            assert.throws(restartService);
            process.env.USING_SYSTEMD = "1";
            assert.equal(canRestartService(), true);
            process.env.DOCKER = "YES";
            assert.equal(canRestartService(), false);
            delete process.env.DOCKER;
            shared.config.server = { updateAllowIPv4CidrRanges: ["127.0.0.1/32"] };
            global.setTimeout = (callback, delay) => scheduled.push({ callback, delay });
            process.exit = code => { assert.equal(code, 0); exits++; };
            const denied = response();
            restartRoute.put({ ip: "192.168.0.20" }, denied);
            assert.equal(denied.statusCode, 403);
            assert.equal(scheduled.length, 0);
            const accepted = response();
            restartRoute.put({ ip: "127.0.0.1" }, accepted);
            assert.equal(accepted.statusCode, 202);
            assert.equal(scheduled[0].delay, 500);
            scheduled[0].callback();
            assert.equal(exits, 1);
            manager.getInfo = async () => ({});
            const info = response();
            await updateRoute.get({ query: {}, ip: "127.0.0.1" }, info);
            assert.equal(info.body.canRestart, true);
            manager.job = { status: "success", restartRequired: true };
            manager.requestRestart();
            scheduled[1].callback();
            assert.equal(exits, 2);
        } finally {
            Object.defineProperty(process, "platform", platform);
            for (const key of ["USING_SYSTEMD", "DOCKER"]) {
                if (savedEnv[key] === undefined) delete process.env[key];
                else process.env[key] = savedEnv[key];
            }
            shared.config.server = config;
            global.setTimeout = timeout;
            process.exit = exit;
            manager.getInfo = getInfo;
            manager.job = job;
            manager.restartScheduled = false;
        }
    });
    it("recognizes only targets containing the Linux startup and restart implementation", async () => {
        const git = manager.git;
        try {
            manager.git = async () => "bin/init.js\nsrc/Mirakurun/service-process.ts\n";
            assert.equal(await manager.hasLinuxSupport("target"), true);
            manager.git = async () => "bin/init.js\n";
            assert.equal(await manager.hasLinuxSupport("target"), false);
        } finally {
            manager.git = git;
        }
    });
});
