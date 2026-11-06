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
import * as api from "../../api";
import * as apid from "../../../../api";
import * as config from "../../config";
import { isLoopbackAddress, canManageUpdate } from "../../update/access";
import { publicServerConfig, validateRemoteConfig, resolveRemoteTuner } from "../../remote/config";

let pendingSave: Promise<void> = Promise.resolve();

export const get: Operation = async (req, res) => {
    res.status(200);
    api.responseJSON(res, publicServerConfig(await config.loadServer() as apid.ConfigServer));
};

get.apiDoc = {
    tags: ["config"],
    operationId: "getServerConfig",
    responses: {
        200: {
            description: "OK",
            schema: {
                $ref: "#/definitions/ConfigServer"
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

export const put: Operation = async (req, res) => {
    const server: apid.ConfigServer = req.body;
    if (!server || typeof server !== "object" || Array.isArray(server)) {
        api.responseError(res, 400, "サーバー設定が不正です");
        return;
    }

    let release: () => void;
    const previousSave = pendingSave;
    pendingSave = new Promise<void>(resolve => release = resolve);
    await previousSave;
    try {
        const current = await config.loadServer() as apid.ConfigServer;
        delete server.remoteDiscordWebhookConfigured;
        for (const field of ["remoteMirakuruns", "remoteManagementEnabled", "remoteAutoRestart", "remoteDiscordWebhook"]) {
            if (server[field] === undefined) {
                server[field] = current[field];
            }
            if (JSON.stringify(server[field]) !== JSON.stringify(current[field]) && !canManageUpdate(req.ip)) {
                api.responseError(res, 403, "Remote設定の変更にはWeb更新と同じ管理権限が必要です");
                return;
            }
        }
        try {
            validateRemoteConfig(server);
            if (JSON.stringify(server.remoteMirakuruns) !== JSON.stringify(current.remoteMirakuruns)) {
                const tuners = await config.loadTuners();
                for (const tuner of tuners) {
                    resolveRemoteTuner(tuner, server);
                }
            }
        } catch (error) {
            api.responseError(res, 400, error.message);
            return;
        }
        if (!isLoopbackAddress(req.ip)) {
            const submitted = server.updateAllowIPv4CidrRanges;
            const existing = current.updateAllowIPv4CidrRanges;
            if (submitted !== undefined && JSON.stringify(submitted) !== JSON.stringify(existing)) {
                api.responseError(res, 403, "Web更新の許可IPはMirakurun本体のlocalhostからのみ変更できます");
                return;
            }
            server.updateAllowIPv4CidrRanges = existing;
        }
        await config.saveServer(server);
        res.status(200);
        api.responseJSON(res, publicServerConfig(server));
    } finally {
        release();
    }
};

put.apiDoc = {
    tags: ["config"],
    operationId: "updateServerConfig",
    parameters: [
        {
            in: "body",
            name: "body",
            schema: {
                $ref: "#/definitions/ConfigServer"
            }
        }
    ],
    responses: {
        200: {
            description: "OK",
            schema: {
                $ref: "#/definitions/ConfigServer"
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
