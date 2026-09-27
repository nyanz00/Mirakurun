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
import * as api from "../../../api";
import updateManager from "../../../update/UpdateManager";
import { canManageUpdate } from "../../../update/access";

export const post: Operation = (req, res) => {
    if (!canManageUpdate(req.ip)) {
        api.responseError(res, 403, "この接続元からWeb更新は実行できません");
        return;
    }
    try {
        updateManager.requestRestart();
        api.responseJSON(res, { accepted: true });
    } catch (err) {
        api.responseError(res, 409, err instanceof Error ? err.message : String(err));
    }
};

post.apiDoc = {
    tags: ["version"],
    operationId: "restartAfterSystemUpdate",
    responses: {
        200: { description: "Accepted", schema: { type: "object" } },
        default: { description: "Unexpected Error", schema: { $ref: "#/definitions/Error" } }
    }
};
