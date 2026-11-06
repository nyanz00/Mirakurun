const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { PassThrough } = require("node:stream");
const { setTimeout: delay } = require("node:timers/promises");
const { StreamSession } = require("../lib/Mirakurun/remote/StreamSession");

async function serve(t, handler, platform = process.platform) {
    const server = http.createServer((req, res) => {
        if (req.url === "/api/status" && platform !== false) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ process: { platform: typeof platform === "function" ? platform() : platform } }));
        } else {
            handler(req, res);
        }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });
    return { host: "127.0.0.1", port: server.address().port, type: "GR", channel: "11", decode: false, priority: 2 };
}

describe("Remote streaming", () => {
    it("corrects GR and all GR-ALT channel numbers only between Windows and Linux", async t => {
        const paths = [];
        let remotePlatform = "win32";
        const options = await serve(t, (req, res) => {
            paths.push(req.url);
            res.write(Buffer.alloc(188, 0x47));
        }, () => remotePlatform);
        for (const type of ["GR", ...Array.from({ length: 20 }, (_, i) => `GR-ALT${i + 1}`)]) {
            for (const [local, remote, input, expected] of [
                ["linux", "win32", "24", "11"],
                ["win32", "linux", "11", "24"],
                ["linux", "linux", "24", "24"],
                ["win32", "win32", "11", "11"]
            ]) {
                remotePlatform = remote;
                const output = new PassThrough();
                output.resume();
                const session = new StreamSession({ ...options, type, channel: input }, output,
                    () => undefined, 1000, 5, local);
                const received = once(output, "data");
                session.start();
                try {
                    await received;
                    assert.equal(paths.at(-1), `/api/channels/${type}/${expected}/stream?decode=0`);
                } finally {
                    session.stop();
                }
            }
        }
    });

    it("leaves satellite channels unchanged without querying the remote OS", async t => {
        const paths = [];
        const options = await serve(t, (req, res) => {
            paths.push(req.url);
            res.write(Buffer.alloc(188, 0x47));
        }, null);
        for (const [type, channel] of [["BS", "BS01_0"], ["CS", "CS08"], ["SKY", "JCSAT3-12"]]) {
            const output = new PassThrough();
            output.resume();
            const session = new StreamSession({ ...options, type, channel }, output,
                () => undefined, 1000, 5, "linux");
            const received = once(output, "data");
            session.start();
            try {
                await received;
                assert.equal(paths.at(-1), `/api/channels/${type}/${channel}/stream?decode=0`);
            } finally {
                session.stop();
            }
        }
    });

    it("reports unavailable OS information or invalid cross-OS numbers without opening a stream", async t => {
        for (const [platform, channel] of [[null, "24"], ["win32", "12"], ["win32", "T24"]]) {
            let streams = 0;
            const options = await serve(t, () => { streams++; }, platform);
            const events = [];
            const session = new StreamSession({ ...options, channel }, new PassThrough(),
                event => events.push(event), 1000, 5, "linux");
            session.start();
            try {
                for (let i = 0; i < 50 && !events.some(event => event.state === "failed"); i++) {
                    await delay(5);
                }
                assert.equal(events.find(event => event.state === "failed")?.retryable, false);
                assert.equal(streams, 0);
            } finally {
                session.stop();
            }
        }
    });

    it("cancels OS discovery on stop and avoids duplicate discovery while starting", async t => {
        let probes = 0;
        let streams = 0;
        let respond;
        const options = await serve(t, (req, res) => {
            if (req.url === "/api/status") {
                probes++;
                respond = () => res.end(JSON.stringify({ process: { platform: "win32" } }));
            } else {
                streams++;
                res.end();
            }
        }, false);
        const session = new StreamSession({ ...options, channel: "24" },
            new PassThrough(), () => undefined, 1000, 5, "linux");
        session.start();
        session.start();
        for (let i = 0; i < 50 && !respond; i++) {
            await delay(5);
        }
        session.stop();
        respond();
        await delay(30);
        assert.equal(probes, 1);
        assert.equal(streams, 0);
    });

    it("forwards priority, updates it without reconnecting, and keeps a healthy stream beyond the startup deadline", async t => {
        let streams = 0;
        let sentPriority;
        const updates = [];
        const options = await serve(t, (req, res) => {
            if (req.url === "/api/remote/priority") {
                let body = "";
                req.on("data", chunk => { body += chunk; });
                req.on("end", () => { updates.push(JSON.parse(body)); res.end("{}"); });
            } else {
                streams++;
                sentPriority = req.headers["x-mirakurun-priority"];
                assert.match(req.headers["x-mirakurun-remote-id"], /^[a-f0-9-]{36}$/);
                res.writeHead(200, { "Content-Type": "video/MP2T" });
                res.write(Buffer.alloc(188, 0x47));
            }
        });
        const events = [];
        const output = new PassThrough();
        output.resume();
        const session = new StreamSession(options, output, event => events.push(event), 100, 5);
        t.after(() => session.stop());
        const received = once(output, "data");
        session.start();
        await received;
        session.setPriority(3);
        await delay(200);
        assert.equal(sentPriority, "2");
        assert.equal(updates.at(-1).priority, 3);
        assert.equal(streams, 1);
        assert.equal(events.filter(event => event.state === "receiving").length, 1);
        assert.equal(events.some(event => event.state === "failed"), false);
    });
    for (const flushHeaders of [false, true]) {
        it(`aborts stalled ${flushHeaders ? "first-data" : "response"} waits before retrying`, async t => {
            let calls = 0;
            let concurrent = 0;
            let maximum = 0;
            const options = await serve(t, (req, res) => {
                calls++;
                concurrent++;
                maximum = Math.max(maximum, concurrent);
                res.once("close", () => concurrent--);
                if (flushHeaders) { res.writeHead(200); res.flushHeaders(); }
            });
            const events = [];
            const session = new StreamSession(options, new PassThrough(), event => events.push(event), 35, 10);
            t.after(() => session.stop());
            session.start();
            await delay(140);
            session.stop();
            const stoppedCalls = calls;
            await delay(80);
            assert.ok(events.some(event => event.state === "failed"));
            assert.ok(calls >= 2);
            assert.equal(maximum, 1);
            assert.equal(calls, stoppedCalls);
        });
    }
    it("does not escalate known authorization and tuner-resource errors", async t => {
        for (const code of [403, 404, 503]) {
            const options = await serve(t, (req, res) => { res.writeHead(code); res.end(); });
            const events = [];
            const session = new StreamSession(options, new PassThrough(), event => events.push(event), 100, 5);
            session.start();
            await delay(30);
            session.stop();
            assert.equal(events.find(event => event.state === "failed").retryable, false);
        }
    });
});
