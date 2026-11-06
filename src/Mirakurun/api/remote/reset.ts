/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
import { Operation } from "express-openapi";
import * as api from "../../api";
import manager from "../../remote/RemoteManager";
import { canManageUpdate } from "../../update/access";

export const post: Operation = (req, res) => {
    if (!canManageUpdate(req.ip)) {
        return api.responseError(res, 403);
    }
    manager.resetRecovery();
    return api.responseJSON(res, manager.status());
};
post.apiDoc = {
    tags: ["remote"], operationId: "resetRemoteRecovery",
    responses: { 200: { description: "Incident limit reset; hourly history retained", schema: { $ref: "#/definitions/RemoteStatus" } }, 403: { description: "Forbidden" } }
};
