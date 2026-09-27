/*
   Copyright 2026 kanreisa

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
import updateManager, { UpdateTargetName } from "../../update/UpdateManager";
import { canManageUpdate } from "../../update/access";

export const get: Operation = async (req, res) => {
    try {
        const info = await updateManager.getInfo(req.query.refresh === "true");
        api.responseJSON(res, {
            ...info,
            canManage: canManageUpdate(req.ip),
            canRestart: process.platform === "win32" && process.env.USING_WINSER === "1"
        });
    } catch (err) {
        api.responseError(res, 500, err instanceof Error ? err.message : String(err));
    }
};

get.apiDoc = {
    tags: ["version"],
    operationId: "getSystemUpdateInfo",
    parameters: [{ in: "query", name: "refresh", type: "boolean", required: false }],
    responses: {
        200: { description: "OK", schema: { $ref: "#/definitions/SystemUpdateInfo" } },
        default: { description: "Unexpected Error", schema: { $ref: "#/definitions/Error" } }
    }
};

export const post: Operation = async (req, res) => {
    if (!canManageUpdate(req.ip)) {
        api.responseError(res, 403, "この接続元からWeb更新は実行できません");
        return;
    }
    const target: UpdateTargetName = req.body?.target;
    const preserveChanges = req.body?.preserveChanges;
    if (!["stable", "develop", "rollback"].includes(target) || typeof preserveChanges !== "boolean") {
        api.responseError(res, 400, "更新オプションが不正です");
        return;
    }
    try {
        const job = await updateManager.start(target, preserveChanges);
        api.responseJSON(res, job);
    } catch (err) {
        api.responseError(res, 409, err instanceof Error ? err.message : String(err));
    }
};

post.apiDoc = {
    tags: ["version"],
    operationId: "startSystemUpdate",
    parameters: [{
        in: "body",
        name: "body",
        required: true,
        schema: { $ref: "#/definitions/SystemUpdateRequest" }
    }],
    responses: {
        200: { description: "Started", schema: { $ref: "#/definitions/SystemUpdateJob" } },
        default: { description: "Unexpected Error", schema: { $ref: "#/definitions/Error" } }
    }
};
