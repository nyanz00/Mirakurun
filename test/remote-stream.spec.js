const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { PassThrough } = require("node:stream");
const { setTimeout: delay } = require("node:timers/promises");
const { StreamSession } = require("../lib/Mirakurun/remote/StreamSession");

async function serve(t, handler) {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });
    return { host: "127.0.0.1", port: server.address().port, type: "GR", channel: "11", decode: false, priority: 2 };
}

describe("Remote streaming", () => {
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
