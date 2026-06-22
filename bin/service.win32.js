/*
   Copyright 2016 kanreisa

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
"use strict";

if (process.platform !== "win32") {
    console.error("Windows service management is only available on win32.");
    process.exit(1);
}

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const serviceName = "mirakurun-nyanz";
const serviceDisplayName = "mirakurun-nyanz";
const rootDir = path.resolve(__dirname, "..");
const localWinserPath = path.join(rootDir, "node_modules", ".bin", "winser.cmd");
const winserCommand = fs.existsSync(localWinserPath) ? localWinserPath : "winser.cmd";

function execWinser(args) {
    childProcess.execFileSync(winserCommand, args, {
        shell: true,
        stdio: "inherit"
    });
}

const action = process.argv[2];

if (action !== "install" && action !== "uninstall") {
    console.error("Usage: node bin/service.win32.js <install|uninstall>");
    process.exit(1);
}

if (action === "uninstall") {
    execWinser(["-r", "-x", "-s", "--name", serviceName]);
    process.exit(0);
}

const logDir = path.join(rootDir, "data", "log");
if (fs.existsSync(logDir) === false) {
    fs.mkdirSync(logDir, { recursive: true });
}
const stdoutLogPath = path.join(logDir, "stdout.log");
const stderrLogPath = path.join(logDir, "stderr.log");

execWinser([
    "-i", "-a", "--name", serviceName, "--displayname", serviceDisplayName, "--startuptype", "auto",
    "--startcmd", "node.exe --max-semi-space-size=64 -r source-map-support/register bin\\init.win32.js",
    "--set", "AppPriority ABOVE_NORMAL_PRIORITY_CLASS",
    "--set", "Type SERVICE_WIN32_OWN_PROCESS",
    "--set", `AppStdout ${stdoutLogPath}`,
    "--set", `AppStderr ${stderrLogPath}`,
    "--env", "USING_WINSER=1"
]);
