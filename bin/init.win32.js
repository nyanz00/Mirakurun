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

require("source-map-support/register");

if (process.platform !== "win32") {
    process.exit(1);
}

const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const configDir = path.join(rootDir, "data", "config");
const dataDir = path.join(rootDir, "data", "db");
const portable = process.env.MIRAKURUN_PORTABLE !== "0";

console.log("rootDir:", rootDir);
console.log("configDir:", configDir);
console.log("dataDir:", dataDir);

setEnv("SERVER_CONFIG_PATH", path.join(configDir, "server.yml"), portable);
setEnv("TUNERS_CONFIG_PATH", path.join(configDir, "tuners.yml"), portable);
setEnv("CHANNELS_CONFIG_PATH", path.join(configDir, "channels.yml"), portable);
setEnv("SERVICES_DB_PATH", path.join(dataDir, "services.json"), portable);
setEnv("PROGRAMS_DB_PATH", path.join(dataDir, "programs.json"), portable);
setEnv("LOGO_DATA_DIR_PATH", path.join(dataDir, "logo-data"), portable);
setEnv("MIRAKURUN_PLATFORM", "win32");

require("../lib/server");

function setEnv(name, value, force = false) {
    if (force) {
        process.env[name] = value;
        return;
    }

    process.env[name] = process.env[name] || value;
}
