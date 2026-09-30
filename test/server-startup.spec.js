const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const entry = path.resolve(__dirname, "../lib/server.js");

function startupFailure(failurePoint) {
    const script = `
        const fs = require("node:fs");
        const path = require("node:path");
        const Module = require("node:module");
        const entry = ${JSON.stringify(entry)};
        const root = path.dirname(path.dirname(entry));
        const directories = new Set(["config", "db", "log"].map(name => path.join(root, "data", name)));
        const existsSync = fs.existsSync;
        const statSync = fs.statSync;
        process.env.USING_WINSER = "1";
        fs.existsSync = filename => {
            if (directories.has(filename)) {
                if (${JSON.stringify(failurePoint)} === "directory") {
                    throw new Error("startup-directory-failure");
                }
                return true;
            }
            return existsSync(filename);
        };
        fs.statSync = filename => directories.has(filename) ? { isDirectory: () => true } : statSync(filename);
        const load = Module._load;
        Module._load = function(request, parent, isMain) {
            if (parent?.filename === entry && request === "./Mirakurun/_") {
                throw new Error("startup-module-failure");
            }
            return load.call(this, request, parent, isMain);
        };
        require(entry);
    `;
    return spawnSync(process.execPath, ["-e", script], {
        encoding: "utf8", timeout: 10000, windowsHide: true
    });
}

describe("server startup failures", () => {
    it("preserves the original module-loading error and exits", () => {
        const result = startupFailure("module");
        assert.ifError(result.error);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Error: startup-module-failure/);
        assert.doesNotMatch(result.stderr, /Cannot access 'status_1' before initialization/);
    });

    it("preserves the original Windows data-directory error and exits", { skip: process.platform !== "win32" }, () => {
        const result = startupFailure("directory");
        assert.ifError(result.error);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Error: startup-directory-failure/);
        assert.doesNotMatch(result.stderr, /Cannot access 'status_1' before initialization/);
    });
});
