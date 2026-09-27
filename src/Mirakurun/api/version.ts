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
import { Operation } from "express-openapi";
import * as fs from "fs";
import * as path from "path";
import * as api from "../api";
import * as apid from "../../../api";
import { getLatestVersion } from "../system";
import * as log from "../log";
import updateManager from "../update/UpdateManager";
const pkg = require("../../../package.json");
const rootDir = path.resolve(__dirname, "../../..");

async function getCurrentBranch(): Promise<string | undefined> {
    if (!fs.existsSync(path.join(rootDir, ".git"))) {
        return undefined;
    }

    try {
        return await updateManager.getCurrentBranch() || undefined;
    } catch (err) {
        log.warn("failed to read current Git branch: %s", err);
        return undefined;
    }
}

export const get: Operation = async (req, res) => {
    let latest = pkg.version;

    try {
        latest = await getLatestVersion();
    } catch (e) {
        log.warn("failed to fetch latest Mirakurun version: %s", e);
    }

    const version: apid.Version = {
        current: pkg.version,
        latest,
        branch: await getCurrentBranch()
    };

    api.responseJSON(res, version);
};

get.apiDoc = {
    tags: ["version"],
    operationId: "checkVersion",
    responses: {
        200: {
            description: "OK",
            schema: {
                $ref: "#/definitions/Version"
            }
        },
        default: {
            description: "Unexpected Error",
            schema: {
                $ref: "#/definitions/Error"
            }
        }
    }
};
