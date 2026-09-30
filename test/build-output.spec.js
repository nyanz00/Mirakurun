const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

it("recreates missing server output even when the source has not changed", () => {
    const root = path.resolve(__dirname, "..");
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "mirakurun-build-test-"));
    const script = require("../package.json").scripts["build:server"];
    // Exercise the actual build's emit options without running lint twice.
    const command = script.split("&&").map(part => part.trim()).find(part => /^tsc\s/.test(part));
    assert.ok(command, "build:server must have a TypeScript compiler step");
    const args = command.split(/\s+/).slice(1);
    const compiler = require.resolve("typescript/lib/tsc.js");
    const build = () => {
        const result = spawnSync(process.execPath, [compiler, ...args, "--outDir", output], {
            cwd: root, encoding: "utf8", timeout: 60000, windowsHide: true
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stdout + result.stderr);
    };
    try {
        const statusFile = path.join(output, "Mirakurun", "status.js");
        build();
        assert.ok(fs.existsSync(statusFile));
        fs.unlinkSync(statusFile);
        build();
        assert.ok(fs.existsSync(statusFile), "the second build must recreate the missing status module");
    } finally {
        assert.equal(path.dirname(path.resolve(output)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(output).startsWith("mirakurun-build-test-"));
        fs.rmSync(output, { recursive: true, force: true });
    }
});
