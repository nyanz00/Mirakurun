/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
"use strict";

const path = require("path");
const rootDir = path.resolve(__dirname, "..");
process.chdir(rootDir);
require("source-map-support/register");
require("dotenv").config();

const portable = process.env.MIRAKURUN_PORTABLE !== "0" && process.env.DOCKER !== "YES";
if (portable || process.platform === "win32") {
    const configDir = path.join(rootDir, "data", "config");
    const dataDir = path.join(rootDir, "data", "db");
    const defaults = {
        SERVER_CONFIG_PATH: path.join(configDir, "server.yml"),
        TUNERS_CONFIG_PATH: path.join(configDir, "tuners.yml"),
        CHANNELS_CONFIG_PATH: path.join(configDir, "channels.yml"),
        SERVICES_DB_PATH: path.join(dataDir, "services.json"),
        PROGRAMS_DB_PATH: path.join(dataDir, "programs.json"),
        LOGO_DATA_DIR_PATH: path.join(dataDir, "logo-data"),
        LOGO_MAP_PATH: path.join(dataDir, "logo-map.json")
    };
    for (const [name, value] of Object.entries(defaults)) {
        // Keep the existing Windows portable behavior; Unix honors explicit paths.
        if ((process.platform === "win32" && portable) || !process.env[name]) {
            process.env[name] = value;
        }
    }
    if (portable) {
        process.env.MIRAKURUN_PORTABLE = "1";
    }
}
process.env.MIRAKURUN_PLATFORM = process.platform;
require("../lib/server");
